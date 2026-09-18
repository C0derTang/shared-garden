begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;
select no_plan();

select has_column('public','garden','spot_capacity','members can read finite visible capacity');
select has_function('public','plant_flower_at',array['text','numeric','text'],'selected-spot planting is available');
select private.bootstrap_members('owner@example.test','member@example.test');
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data) values
 ('11111111-1111-4111-8111-111111111111','authenticated','authenticated','owner@example.test',now(),'{"provider":"google","providers":["google"]}'),
 ('22222222-2222-4222-8222-222222222222','authenticated','authenticated','member@example.test',now(),'{"provider":"google","providers":["google"]}'),
 ('33333333-3333-4333-8333-333333333333','authenticated','authenticated','outsider@example.test',now(),'{"provider":"google","providers":["google"]}');
insert into auth.identities(user_id,provider_id,provider,identity_data) values
 ('11111111-1111-4111-8111-111111111111','spot-owner','google','{"sub":"spot-owner","email":"owner@example.test","email_verified":true}'),
 ('22222222-2222-4222-8222-222222222222','spot-member','google','{"sub":"spot-member","email":"member@example.test","email_verified":true}'),
 ('33333333-3333-4333-8333-333333333333','spot-outsider','google','{"sub":"spot-outsider","email":"outsider@example.test","email_verified":true}');
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","amr":[{"method":"oauth"}]}',true);
set local role authenticated;
select lives_ok('select public.initialize_garden()','member initializes garden');
select is((select spot_capacity from public.garden),12::bigint,'initial garden exposes one twelve-spot bed');
select is((select count(*) from public.flowers),1::bigint,'one Cactus is the only initial occupant');
select is((select initialized_at from public.garden),(select planted_at from public.flowers where type_key='cactus'),'initialization timestamp shares the post-lock Cactus instant');
select is_empty('select u.type_key from public.flower_unlocks u, public.garden g where u.unlocked_at <> g.initialized_at','initial unlock timestamps use the post-lock initialization instant');
select lives_ok($$select public.plant_flower_at('rose',12)$$,'highest visible spot is selectable');
select results_eq($$select spot,planted_by,growth_units,is_initial from public.flowers where type_key='rose'$$,
 $$values (12::bigint,1::smallint,0::smallint,false)$$,'explicit selection retains trusted author and initial progress');
select results_eq('select next_spot,spot_capacity from public.garden',
 $$values (2::bigint,12::bigint)$$,'high choice neither skips empty spots nor expands bed');
select lives_ok($$select public.plant_flower_at('marigold',3)$$,'low non-next visible spot is selectable');
select lives_ok($$select public.plant_flower('rose')$$,'legacy automatic operation remains available');
select results_eq('select spot from public.flowers order by spot',
 $$values (1::bigint),(2::bigint),(3::bigint),(12::bigint)$$,'automatic planting fills lowest hole without moving earlier plants');
select is((select next_spot from public.garden),4::bigint,'automatic cursor advances over occupied spots');
select throws_ok(format('select public.plant_flower_at(''tulip'',%L::numeric)',s),'22023','Invalid planting spot','invalid visible spot rejected: '||coalesce(s,'null'))
 from (values (null::text),('0'),('-1'),('1.5'),('13'),('100000000000000000000'),('NaN'),('Infinity'),('-Infinity')) x(s);
select throws_ok(format('select public.plant_flower_at(''tulip'',%s)',s),'22023','Planting spot is occupied','occupied spot rejected: '||s)
 from (values (1),(12)) x(s);
select throws_ok($$select public.plant_flower_at('cactus',4)$$,'22023','Cactus is already part of this garden','selected operation cannot duplicate Cactus');
select throws_ok($$select public.plant_flower_at('dandelion',4,'wish')$$,'22023','Flower is locked','selected operation preserves unlock boundary');
select throws_ok($$select public.plant_flower_at('unknown',4)$$,'22023','Unknown flower type','selected operation rejects unknown type');
select throws_ok($$select public.plant_flower_at('rose',4,'')$$,'22023','Only Dandelion accepts a shared wish','selected operation rejects unrelated wish');
select throws_ok($$select public.plant_flower_at('rose',4,p_planted_by=>2::smallint)$$,'42883',null,'no client actor input');
select throws_ok($$select public.plant_flower_at('rose',4,p_planted_at=>now())$$,'42883',null,'no client timestamp input');
select throws_ok($$select public.plant_flower_at('rose',4,p_growth_units=>5)$$,'42883',null,'no client stage input');
select throws_ok($$select public.plant_flower_at('rose',4,p_garden_day=>current_date)$$,'42883',null,'no client day input');
select throws_ok($$select public.plant_flower_at('rose',4,p_x=>1,p_y=>2)$$,'42883',null,'no arbitrary coordinates');
select results_eq('select next_spot,spot_capacity from public.garden',
 $$values (4::bigint,12::bigint)$$,'failed selections do not consume space');
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","member_id":1,"amr":[{"method":"oauth"}]}',true);
select lives_ok($$select public.plant_flower_at('rose',4)$$,'partner can select an available spot');
select is((select planted_by from public.flowers where spot=4),2::smallint,'selected operation ignores forged member claim');
select throws_ok($$select public.plant_flower_at('rose',5)$$,'22023','Unfinished flower limit reached','selected operation enforces unfinished cap');
select is((select count(*) from public.flowers),5::bigint,'cap failure creates no plant');
reset role;
select ok((select bool_and(planted_at between transaction_timestamp() and clock_timestamp()) from public.flowers),'all planting instants come from server');
select is_empty($$select f.id from public.flowers f cross join lateral private.garden_clock_at(f.planted_at) c where f.planted_day<>c.garden_day$$,'all planting days match authoritative instants');
create temporary table original_plants as select * from public.flowers;
select private.record_first_bloom(id,planted_day) from public.flowers where not is_initial;

create function pg_temp.fill_spots(p_low integer,p_high integer) returns void language plpgsql as $$
declare v_flower public.flowers; n integer;
begin
 for n in p_low..p_high loop
  select * into v_flower from public.plant_flower_at('rose',n);
  perform private.record_first_bloom(v_flower.id,v_flower.planted_day);
 end loop;
end $$;
select pg_temp.fill_spots(5,10);
select results_eq('select next_spot,spot_capacity from public.garden',
 $$values (11::bigint,12::bigint)$$,'one remaining gap keeps first bed capacity');
select pg_temp.fill_spots(11,11);
select results_eq('select next_spot,spot_capacity from public.garden',
 $$values (13::bigint,24::bigint)$$,'filling final gap adds exactly one bed');
select is((select count(*) from public.flowers),12::bigint,'expansion creates no extra plants');
select is_empty('select o.id from original_plants o left join public.flowers f using(id) where f.id is null or (f.spot,f.type_key,f.planted_at,f.planted_day,f.planted_by,f.shared_wish,f.is_initial) is distinct from (o.spot,o.type_key,o.planted_at,o.planted_day,o.planted_by,o.shared_wish,o.is_initial)','plant and history identities remain unchanged across expansion');
select is((select count(*) from public.flowers where first_bloom_at is not null),11::bigint,'all first-bed blooms remain present');
select pg_temp.fill_spots(24,24);
select results_eq('select next_spot,spot_capacity from public.garden',
 $$values (13::bigint,24::bigint)$$,'high second-bed choice does not expand prematurely');
select pg_temp.fill_spots(13,23);
select results_eq('select next_spot,spot_capacity from public.garden',
 $$values (25::bigint,36::bigint)$$,'another full bed expands beyond twenty plants');
set local role authenticated;
select throws_ok($$select public.plant_flower_at('dandelion',25)$$,'22023','Dandelion needs a shared wish of 1 to 500 characters','selected wish cannot be absent');
select throws_ok($$select public.plant_flower_at('dandelion',25,E' \t\n ')$$,'22023','Dandelion needs a shared wish of 1 to 500 characters','selected wish cannot be whitespace');
select throws_ok($$select public.plant_flower_at('dandelion',25,repeat('x',501))$$,'22023','Dandelion needs a shared wish of 1 to 500 characters','selected wish length is bounded');
select lives_ok($$select public.plant_flower_at('dandelion',36,E' \t A shared wish \n ')$$,'selected wish is accepted after unlock');
select is((select shared_wish from public.flowers where spot=36),'A shared wish','selected wish is normalized');
select lives_ok($$select public.plant_flower_at('dandelion',35,repeat('🌱',500))$$,'selected wish uses Unicode character boundary');
select lives_ok('select public.initialize_garden()','reinitialization preserves expanded state');
select results_eq('select next_spot,spot_capacity from public.garden',
 $$values (25::bigint,36::bigint)$$,'reinitialization preserves holes and bed count');
select throws_ok('update public.garden set spot_capacity=12000','42501','permission denied for table garden','member cannot expand capacity directly');
select throws_ok('update public.flowers set spot=999','42501','permission denied for table flowers','member cannot forge spot directly');
select throws_ok($$select private.plant_flower('rose',null,25,false)$$,'42501','permission denied for schema private','private shared allocator is not member-callable');
select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","amr":[{"method":"oauth"}]}',true);
select is_empty('select spot_capacity from public.garden','stranger cannot read capacity');
select throws_ok($$select public.plant_flower_at('rose',25)$$,'42501','Garden access denied','stranger cannot select or expand a spot');
reset role;
set local role anon;
select throws_ok($$select public.plant_flower_at('rose',25)$$,'42501','permission denied for function plant_flower_at','anonymous selected operation denied');
reset role;
set local role service_role;
select throws_ok($$select public.plant_flower_at('rose',25)$$,'42501','permission denied for function plant_flower_at','service API selected operation denied');
select throws_ok('update public.garden set spot_capacity=12000','42501','permission denied for table garden','service API cannot expand directly');
reset role;
select ok(not has_function_privilege('supabase_auth_admin','public.plant_flower_at(text,numeric,text)','EXECUTE'),'Auth role selected operation denied');
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","amr":[{"method":"oauth"}]}',true);
update private.garden_members set revoked_at=now() where member_id=1;
set local role authenticated;
select throws_ok($$select public.plant_flower_at('rose',25)$$,'42501','Garden access denied','revoked member selected operation denied');
reset role;
select is_empty($$select p.oid from pg_proc p, lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid in ('public.plant_flower_at(text,numeric,text)'::regprocedure,'private.plant_flower(text,text,numeric,boolean)'::regprocedure) and acl.grantee=0 and acl.privilege_type='EXECUTE'$$,'new allocation functions have no PUBLIC execute');
select is_empty($$select p.oid from pg_proc p where p.oid in ('public.plant_flower_at(text,numeric,text)'::regprocedure,'private.plant_flower(text,text,numeric,boolean)'::regprocedure) and not (p.proconfig @> array['search_path=pg_catalog'])$$,'new allocation functions have trusted search paths');
select ok(not has_function_privilege(r,'private.plant_flower(text,text,numeric,boolean)','EXECUTE'),r||' cannot invoke private allocator')
 from (values ('anon'),('authenticated'),('service_role'),('supabase_auth_admin')) x(r);
select * from finish();
rollback;
