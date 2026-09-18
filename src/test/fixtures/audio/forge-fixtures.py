import pathlib, struct
root=pathlib.Path('/probe/fixtures')
original=(root/'tone-301.mp4').read_bytes()
containers={b'moov',b'trak',b'mdia',b'minf',b'stbl',b'edts'}
def boxes(data,start=0,end=None):
 if end is None:end=len(data)
 while start+8<=end:
  length,typ=struct.unpack_from('>I4s',data,start)
  assert length>=8 and start+length<=end,(start,length,typ)
  yield start,length,typ
  if typ in containers:yield from boxes(data,start+8,start+length)
  start+=length
short_headers=bytearray(original)
short_edit=bytearray(original)
for p,n,t in boxes(original):
 if t in (b'mvhd',b'mdhd'):
  assert original[p+8]==0
  timescale=struct.unpack_from('>I',original,p+20)[0]
  struct.pack_into('>I',short_headers,p+24,5*timescale)
 if t==b'tkhd':
  assert original[p+8]==0
  struct.pack_into('>I',short_headers,p+28,5000)
 if t==b'elst':
  assert original[p+8]==0
  count=struct.unpack_from('>I',original,p+12)[0]
  assert count==1
  struct.pack_into('>I',short_edit,p+16,5000)
  # Hide the first 296 seconds with the edit's media_time.
  struct.pack_into('>i',short_edit,p+20,296*48000)
(root/'forged-duration.mp4').write_bytes(short_headers)
(root/'forged-edit.mp4').write_bytes(short_edit)
(root/'truncated.mp4').write_bytes(original[:len(original)//2])
# EBML Info Duration is a float in milliseconds. Change only that field.
webm=bytearray((root/'tone-301.webm').read_bytes())
needle=bytes.fromhex('448988')
offset=webm.find(needle)
assert offset>0,'expected float64 Duration'
struct.pack_into('>d',webm,offset+3,5000.0)
(root/'forged-duration.webm').write_bytes(webm)
