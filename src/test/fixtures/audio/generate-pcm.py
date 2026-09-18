import array, math, pathlib, wave
root=pathlib.Path('/probe/fixtures');root.mkdir(exist_ok=True)
rate=48000
block=array.array('h',(int(6000*math.sin(2*math.pi*440*n/rate)) for n in range(rate))).tobytes()
for seconds in (5,300,301):
 with wave.open(str(root/f'tone-{seconds}.wav'),'wb') as w:
  w.setnchannels(1);w.setsampwidth(2);w.setframerate(rate)
  for _ in range(seconds):w.writeframesraw(block)
(root/'garbage.mp4').write_bytes(b'not an audio file\0'*100)
(root/'empty.webm').write_bytes(b'')
