"""Local authored explainer, not a recording of model execution. Pillow + ffmpeg + macOS TTS."""
import json,subprocess,math
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'benchmark-runs/d032-video';OUT.mkdir(exist_ok=True)
scenes=json.loads((Path(__file__).parent/'d032-scenes.json').read_text())
font='/System/Library/Fonts/AppleSDGothicNeo.ttc'
def f(size):return ImageFont.truetype(font,size)
durations=[]
for i,s in enumerate(scenes):
 text=OUT/f'{i}.txt';text.write_text(s['narration'])
 audio=OUT/f'{i}.aiff'
 subprocess.run(['say','-v','Yuna','-r','190','-f',str(text),'-o',str(audio)],check=True)
 dur=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',str(audio)]))
 durations.append(dur)
(OUT/'audio-list.txt').write_text(''.join(f"file '{i}.aiff'\n" for i in range(len(scenes))))
subprocess.run(['ffmpeg','-y','-v','error','-f','concat','-safe','0','-i',str(OUT/'audio-list.txt'),str(OUT/'narration.wav')],check=True)
fps=12;W,H=1280,720;total=sum(durations)
p=subprocess.Popen(['ffmpeg','-y','-v','error','-f','rawvideo','-pixel_format','rgb24','-video_size',f'{W}x{H}','-framerate',str(fps),'-i','pipe:0','-i',str(OUT/'narration.wav'),'-c:v','libx264','-preset','fast','-crf','22','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart','-shortest',str(OUT/'jev-worker-builder-ko.mp4')],stdin=subprocess.PIPE)
ends=[];t=0
for dur in durations:t+=dur;ends.append(t)
for n in range(math.ceil(total*fps)):
 t=n/fps;i=next((k for k,e in enumerate(ends) if t<e),len(ends)-1);s=scenes[i];start=0 if i==0 else ends[i-1];local=(t-start)/durations[i]
 im=Image.new('RGB',(W,H),'#0c1424');d=ImageDraw.Draw(im)
 d.text((55,30),'JEV ROUTER / IMPLEMENTATION WALKTHROUGH',font=f(22),fill='#69d9c1')
 d.text((1150,30),f'{i+1:02}/08',font=f(25),fill='#91a4c2')
 d.text((55,91),s['title'],font=f(48),fill='#f2f5fa')
 d.rounded_rectangle((55,166,1225,209),radius=9,fill='#183348');d.text((73,173),s['tag'],font=f(24),fill='#86e7d1')
 for j,line in enumerate(s['lines']):
  y=252+j*76;active=local>j*.11
  d.rounded_rectangle((55,y-6,1225,y+55),radius=10,fill='#15283b' if active else '#101e30')
  d.ellipse((74,y+14,84,y+24),fill='#63d9bd' if active else '#355069')
  size=29 if len(line)<65 else 25
  d.text((104,y+5),line,font=f(size),fill='#edf3fb' if active else '#6e809a')
 d.text((55,603),s['source'],font=f(20),fill='#91a4c2')
 d.text((55,637),'코드 기반 설명 · 실제 실행 녹화 아님  |  2026-10-10',font=f(20),fill='#91a4c2')
 d.rectangle((55,687,1225,693),fill='#23354c');d.rectangle((55,687,55+int(1170*t/total),693),fill='#62ddc1')
 if n in [0,int(ends[1]*fps)+2,int(ends[3]*fps)+2,int(ends[6]*fps)+2]:im.save(OUT/f'preview-{i}.png')
 p.stdin.write(im.tobytes())
p.stdin.close();assert p.wait()==0
(OUT/'metadata.json').write_text(json.dumps({'duration_seconds':total,'size':[W,H],'fps':fps,'scenes':len(scenes),'voice':'macOS Yuna Korean TTS','kind':'authored code explainer, not live recording'},indent=2))
print(json.dumps({'path':str(OUT/'jev-worker-builder-ko.mp4'),'duration_seconds':total}))
