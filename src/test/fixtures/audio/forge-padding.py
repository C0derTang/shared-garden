from pathlib import Path
import struct
root=Path('/probe/fixtures')
masters={0x18538067,0x1654ae6b,0xae}
def vint(data,p,strip):
 first=data[p];w=1
 while not first&(0x80>>(w-1)):w+=1
 value=int.from_bytes(data[p:p+w],'big')
 return value&((1<<(7*w))-1) if strip else value,w

def rebuild(data,start=0,end=None):
 if end is None:end=len(data)
 out=bytearray();p=start
 while p<end:
  typ,iw=vint(data,p,False);length,sw=vint(data,p+iw,True)
  unknown=length==(1<<(7*sw))-1
  a=p+iw+sw;b=end if unknown else a+length
  payload=data[a:b]
  if typ in masters:payload=rebuild(data,a,b)
  if typ==0x56aa:payload=(1365312500).to_bytes(4,'big')
  if typ==0x63a2 and payload.startswith(b'OpusHead'):
   payload=bytearray(payload);struct.pack_into('<H',payload,10,65535)
  out+=data[p:p+iw]
  out+=data[p+iw:a] if unknown else ((1<<(7*sw))|len(payload)).to_bytes(sw,'big')
  out+=payload;p=b
 return out
(root/'forged-padding.webm').write_bytes(rebuild((root/'tone-301.webm').read_bytes()))
