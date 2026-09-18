begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;
select no_plan();

select has_table('public', 'flower_catalog', 'members have a flower catalog');
select has_table('public', 'garden', 'one durable shared garden exists');
select has_table('public', 'flowers', 'durable flower instances exist');
select has_table('public', 'flower_unlocks', 'earned unlocks are durable');
select has_function('public', 'initialize_garden', array[]::text[], 'guarded initialization exists');
select has_function('public', 'plant_flower', array['text','text'], 'guarded planting exists');



select results_eq($$select type_key, growth_target::integer, unfinished_limit::integer, unlock_after_blooms::integer from public.flower_catalog order by type_key$$,
 $$values ('bluebell'::text,7::smallint,1::smallint,6::smallint), ('cactus',10,1,0), ('daisy',7,1,1),
 ('dandelion',5,3,7), ('forget-me-not',10,1,8), ('hydrangea',7,1,2), ('marigold',5,2,0),
 ('moonflower',5,1,5), ('peony',4,1,9), ('rose',5,3,0), ('snapdragon',5,1,4), ('sunflower',7,1,3), ('tulip',7,1,0)$$,
 'exactly the approved catalog, targets, per-type capacities and thresholds');
select is((select count(*) from public.garden),0::bigint,'migration adds no fabricated garden activity');

select private.bootstrap_members('owner@example.test','member@example.test');
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data) values
 ('11111111-1111-4111-8111-111111111111','authenticated','authenticated','owner@example.test',now(),'{"provider":"google","providers":["google"]}'),
 ('22222222-2222-4222-8222-222222222222','authenticated','authenticated','member@example.test',now(),'{"provider":"google","providers":["google"]}'),
 ('33333333-3333-4333-8333-333333333333','authenticated','authenticated','outsider@example.test',now(),'{"provider":"google","providers":["google"]}');
insert into auth.identities(user_id,provider_id,provider,identity_data) values
 ('11111111-1111-4111-8111-111111111111','planting-owner','google','{"sub":"planting-owner","email":"owner@example.test","email_verified":true}'),
 ('22222222-2222-4222-8222-222222222222','planting-member','google','{"sub":"planting-member","email":"member@example.test","email_verified":true}'),
 ('33333333-3333-4333-8333-333333333333','planting-outsider','google','{"sub":"planting-outsider","email":"outsider@example.test","email_verified":true}');
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","amr":[{"method":"oauth"}]}',true);
set local role authenticated;
select lives_ok('select public.initialize_garden()','approved owner can initialize');
select lives_ok('select public.initialize_garden()','initialization can repeat');
select is((select count(*) from public.garden),1::bigint,'one shared garden');
select results_eq('select type_key,spot,planted_by,is_initial,growth_units,first_bloom_at,shared_wish from public.flowers',
 $$values ('cactus'::text,1::bigint,null::smallint,true,0::smallint,null::timestamptz,null::text)$$,'fresh garden contains only permanent initial Cactus');
select results_eq('select type_key from public.flower_unlocks order by type_key',
 $$values ('cactus'::text),('marigold'),('rose'),('tulip')$$,'only four initial types unlocked');
select is((select count(*) from public.flower_catalog),13::bigint,'member can read whole catalog');
select throws_ok(format('select public.plant_flower(%L)',t),'22023','Flower is locked',t||' is locked initially')
 from (values ('daisy'),('hydrangea'),('sunflower'),('snapdragon'),('moonflower'),('bluebell'),('dandelion'),('forget-me-not'),('peony')) x(t);
select throws_ok($$select public.plant_flower('cactus')$$,'22023','Cactus is already part of this garden','additional Cactus rejected');
select throws_ok($$select public.plant_flower('unknown')$$,'22023','Unknown flower type','unknown type rejected');
select throws_ok($$select public.plant_flower(null)$$,'22023','Unknown flower type','null type rejected');
select throws_ok($$select public.plant_flower('rose','wish')$$,'22023','Only Dandelion accepts a shared wish','ordinary flower cannot carry wish data');
select throws_ok($$select public.plant_flower('rose','')$$,'22023','Only Dandelion accepts a shared wish','even empty unwanted wish rejected');
select throws_ok($$select public.plant_flower(p_type_key=>'rose',p_planted_by=>2::smallint)$$,'42883',null,'no client actor argument');
select throws_ok($$select public.plant_flower(p_type_key=>'rose',p_planted_at=>now())$$,'42883',null,'no client timestamp argument');
select throws_ok($$select public.plant_flower(p_type_key=>'rose',p_growth_units=>5)$$,'42883',null,'no client stage argument');
select throws_ok($$select public.plant_flower(p_type_key=>'rose',p_spot=>99)$$,'42883',null,'no client position argument');
select throws_ok($$select public.plant_flower(p_type_key=>'rose',p_garden_day=>current_date)$$,'42883',null,'no client garden-day argument');
select lives_ok($$select public.plant_flower('rose')$$,'owner plants first seed');
select results_eq($$select planted_by,spot,growth_units,is_initial from public.flowers where type_key='rose'$$,
 $$values (1::smallint,2::bigint,0::smallint,false)$$,'planting derives owner and next spot with zero progress');
select ok((select planted_at <= clock_timestamp() and planted_at >= transaction_timestamp() from public.flowers where type_key='rose'),'server records actual planting time');
reset role;
select is((select planted_day from public.flowers where type_key='rose'),
 (select c.garden_day from public.flowers f cross join lateral private.garden_clock_at(f.planted_at) c where f.type_key='rose'),'garden day comes from the server clock');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","member_id":1,"amr":[{"method":"oauth"}]}',true);
select lives_ok('select public.initialize_garden()','partner initialization shares existing state');
select lives_ok($$select public.plant_flower('marigold')$$,'partner can plant');
select is((select planted_by from public.flowers where type_key='marigold'),2::smallint,'spoofed member claim cannot change planter');
select is((select count(*) from public.flowers where is_initial),1::bigint,'initial Cactus remains distinguishable from user plantings');
select is((select count(distinct type_key) from public.flowers),3::bigint,'all types planted can include initial Cactus');
select is((select count(*) from public.flowers where not is_initial),2::bigint,'first-seed facts exclude initial Cactus');
reset role;

-- A trusted future evaluator owns bloom credit; its seam is not a client RPC.
-- Check every exact unlock boundary and repeated once-per-instance credit.
create function pg_temp.test_unlocks() returns setof text language plpgsql as $$
declare r record; v_flower uuid; v_day date; v_first timestamptz;
begin
 select garden_day into v_day from private.garden_clock_at(statement_timestamp());
 for r in select * from (values (1,'daisy'),(2,'hydrangea'),(3,'sunflower'),(4,'snapdragon'),(5,'moonflower'),(6,'bluebell'),(7,'dandelion'),(8,'forget-me-not'),(9,'peony')) x(n,t) loop
  return next extensions.is((select count(*) from public.flowers where first_bloom_at is not null),(r.n-1)::bigint,'before threshold '||r.n);
  return next extensions.ok(not exists(select 1 from public.flower_unlocks where type_key=r.t),r.t||' remains locked below threshold');
  if r.n=1 then select id into v_flower from public.flowers where type_key='cactus';
  else select id into v_flower from public.plant_flower('rose'); end if;
  perform private.record_first_bloom(v_flower,v_day);
  select first_bloom_at into v_first from public.flowers where id=v_flower;
  return next extensions.ok(exists(select 1 from public.flower_unlocks where type_key=r.t),r.t||' unlocks at exact threshold');
  perform private.record_first_bloom(v_flower,v_day);
  return next extensions.is((select count(*) from public.flowers where first_bloom_at is not null),r.n::bigint,'repeat completion never adds bloom credit');
  return next extensions.is((select first_bloom_at from public.flowers where id=v_flower),v_first,'first bloom timestamp cannot restart');
 end loop;
end $$;
select * from pg_temp.test_unlocks();
select is((select count(*) from public.flower_unlocks),13::bigint,'nine total blooms permanently unlock all types');
select throws_ok($$select private.record_first_bloom('ffffffff-ffff-4fff-8fff-ffffffffffff',current_date)$$,'22023','Unknown flower','bloom seam rejects unknown flower');
select throws_ok($$select private.record_first_bloom((select id from public.flowers limit 1),null)$$,'22023','Invalid bloom credit day','bloom seam requires real credit day');
select throws_ok($$select private.record_first_bloom((select id from public.flowers limit 1),current_date+100)$$,'22023','Invalid bloom credit day','bloom seam rejects future credit day');
select throws_ok($$select private.record_first_bloom((select id from public.flowers limit 1),date '2000-01-01')$$,'22023','Invalid bloom credit day','bloom seam rejects day before planting');
set local role authenticated;
select throws_ok($$select public.plant_flower('cactus')$$,'22023','Cactus is already part of this garden','bloomed Cactus can never be replanted');
select throws_ok($$select private.record_first_bloom((select id from public.flowers limit 1),current_date)$$,'42501','permission denied for schema private','member cannot forge bloom credit');
select throws_ok($$select public.plant_flower('dandelion')$$,'22023','Dandelion needs a shared wish of 1 to 500 characters','Dandelion requires wish');
select throws_ok($$select public.plant_flower('dandelion', E' \t\n ')$$,'22023','Dandelion needs a shared wish of 1 to 500 characters','whitespace wish rejected');
select throws_ok($$select public.plant_flower('dandelion',repeat('x',501))$$,'22023','Dandelion needs a shared wish of 1 to 500 characters','overlong wish rejected');
select lives_ok($$select public.plant_flower('dandelion', E' \t A shared wish \n ')$$,'trimmed wish accepted');
select is((select shared_wish from public.flowers where type_key='dandelion'),'A shared wish','wish stored without outside whitespace');
select lives_ok($$select public.plant_flower('dandelion',repeat('🌱',500))$$,'500 Unicode character boundary accepted');
reset role;

-- Fill every unfinished capacity, then free one slot through a durable bloom.
-- Ordinary caps are independent; completed flowers and their spots remain.
create function pg_temp.test_capacities() returns setof text language plpgsql as $$
declare r record; v_id uuid; v_spot bigint; v_total bigint; v_day date;
begin
 select garden_day into v_day from private.garden_clock_at(statement_timestamp());
 for r in select * from (values ('rose',3),('marigold',2),('tulip',1),('daisy',1),('hydrangea',1),('sunflower',1),('snapdragon',1),('moonflower',1),('bluebell',1),('dandelion',3),('forget-me-not',1),('peony',1)) x(t,cap) loop
  while (select count(*) from public.flowers where type_key=r.t and first_bloom_at is null)<r.cap loop
   perform public.plant_flower(r.t,case when r.t='dandelion' then 'Wish' end);
  end loop;
  return next extensions.throws_ok(format('select public.plant_flower(%L,%L)',r.t,case when r.t='dandelion' then 'Wish' end),'22023','Unfinished flower limit reached',r.t||' rejects cap plus one');
  select id,spot into v_id,v_spot from public.flowers where type_key=r.t and first_bloom_at is null order by spot limit 1;
  select count(*) into v_total from public.flowers;
  perform private.record_first_bloom(v_id,v_day);
  perform public.plant_flower(r.t,case when r.t='dandelion' then 'Next wish' end);
  return next extensions.is((select count(*) from public.flowers),v_total+1,r.t||' bloom frees capacity without removing history');
  return next extensions.is((select spot from public.flowers where id=v_id),v_spot,r.t||' bloom keeps its stable spot');
  return next extensions.is((select count(*) from public.flowers where type_key=r.t and first_bloom_at is null),r.cap::bigint,r.t||' remains within unfinished cap');
 end loop;
end $$;
select * from pg_temp.test_capacities();
select ok((select count(*)>30 from public.flowers),'garden expands beyond twenty plants with no overall cap');
select is((select count(*) from public.flowers),(select count(distinct spot) from public.flowers),'spots never overlap');
select is((select max(spot) from public.flowers),(select count(*) from public.flowers),'successful plantings allocate increasing stable spots');
select is((select next_spot from public.garden),(select max(spot)+1 from public.flowers),'next spot follows all completed and unfinished flowers');
select is((select count(*) from public.flowers where type_key='cactus'),1::bigint,'one permanent Cactus after all operations');
select is((select count(*) from public.flower_unlocks),13::bigint,'unlocks persist after further blooms');
select is((select count(*) from public.flowers where type_key='dandelion'),4::bigint,'all Dandelion planting facts including blooms persist');
select lives_ok($$select private.record_first_bloom((select id from public.flowers where type_key='dandelion' and first_bloom_at is null limit 1),(select garden_day from private.garden_clock_at(statement_timestamp())))$$,'another Dandelion completion frees fifth wish planting');
set local role authenticated;
select lives_ok($$select public.plant_flower('dandelion','Fifth wish')$$,'fifth durable wish can be planted');
select is((select count(*) from public.flowers where type_key='dandelion'),5::bigint,'durable facts support five-wishes achievement');

-- Direct writes cannot bypass RPC actor, progress, spot, unlock or retention rules.
select throws_ok('insert into public.garden(id) values(1)','42501','permission denied for table garden','client cannot insert garden');
select throws_ok('update public.garden set next_spot=99','42501','permission denied for table garden','client cannot forge next spot');
select throws_ok($$insert into public.flowers(type_key,spot,planted_day) values('rose',99,current_date)$$,'42501','permission denied for table flowers','client cannot insert flower');
select throws_ok('update public.flowers set growth_units=99,planted_by=1,spot=999','42501','permission denied for table flowers','client cannot overwrite protected fields');
select throws_ok('delete from public.flowers','42501','permission denied for table flowers','client cannot remove Cactus or history');
select throws_ok($$update public.flower_catalog set unfinished_limit=999$$,'42501','permission denied for table flower_catalog','client cannot alter catalog limits');
select throws_ok($$insert into public.flower_unlocks(type_key) values('rose')$$,'42501','permission denied for table flower_unlocks','client cannot forge unlock');
select throws_ok('delete from public.flower_unlocks','42501','permission denied for table flower_unlocks','client cannot relock a type');
select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","member_id":1,"amr":[{"method":"oauth"}]}',true);
select is_empty('select * from public.'||t,'stranger cannot read '||t) from (values ('garden'),('flowers'),('flower_catalog'),('flower_unlocks')) x(t);
select throws_ok('select public.initialize_garden()','42501','Garden access denied','stranger cannot initialize');
select throws_ok($$select public.plant_flower('rose')$$,'42501','Garden access denied','stranger cannot plant');
select throws_ok('select * from private.garden_members','42501','permission denied for schema private','garden reads expose no private membership configuration');
reset role;
set local role anon;
select throws_ok('select * from public.'||t,'42501','permission denied for table '||t,'anonymous cannot read '||t) from (values ('garden'),('flowers'),('flower_catalog'),('flower_unlocks')) x(t);
select throws_ok('select public.initialize_garden()','42501','permission denied for function initialize_garden','anonymous cannot initialize');
select throws_ok($$select public.plant_flower('rose')$$,'42501','permission denied for function plant_flower','anonymous cannot plant');
reset role;
set local role service_role;
select throws_ok('select * from public.flowers','42501','permission denied for table flowers','service API cannot bypass explicit data grants');
select throws_ok($$select public.plant_flower('rose')$$,'42501','permission denied for function plant_flower','service API cannot plant');
reset role;

select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","amr":[{"method":"oauth"}]}',true);
update private.garden_members set revoked_at=now() where member_id=1;
set local role authenticated;
select is_empty('select * from public.flowers','revoked member immediately loses reads');
select throws_ok($$select public.plant_flower('rose')$$,'42501','Garden access denied','revoked member immediately loses planting');
reset role;
select throws_ok($$select private.record_first_bloom((select id from public.flowers limit 1),current_date)$$,'42501','Garden access denied','private mutation also requires current membership');

select ok(c.relrowsecurity,c.relname||' enables RLS') from pg_class c where c.oid in ('public.garden'::regclass,'public.flowers'::regclass,'public.flower_catalog'::regclass,'public.flower_unlocks'::regclass);
select is_empty($$select p.oid from pg_proc p, lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid in ('public.initialize_garden()'::regprocedure,'public.plant_flower(text,text)'::regprocedure,'private.ensure_garden()'::regprocedure,'private.record_first_bloom(uuid,date)'::regprocedure) and acl.grantee=0 and acl.privilege_type='EXECUTE'$$,'no new mutation has PUBLIC execution');
select is_empty($$select p.oid from pg_proc p where p.oid in ('public.initialize_garden()'::regprocedure,'public.plant_flower(text,text)'::regprocedure,'private.ensure_garden()'::regprocedure,'private.record_first_bloom(uuid,date)'::regprocedure) and not (p.proconfig @> array['search_path=pg_catalog'])$$,'every mutation has fixed safe search path');
select * from finish();
rollback;
