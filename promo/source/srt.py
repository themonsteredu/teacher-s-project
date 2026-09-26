# compose.html 의 SUBS 배열에서 .srt 자막 파일을 만든다
import re, sys
src = open('compose.html', encoding='utf-8').read()
subs = re.findall(r"\[([\d.]+),([\d.]+),'([^']+)'\]", src.split('const SUBS = [')[1].split('];')[0])
def ts(s):
    s = float(s); ms = int(round(s * 1000))
    return f"{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}"
out = '\n'.join(f"{i}\n{ts(a)} --> {ts(b)}\n{t}\n" for i, (a, b, t) in enumerate(subs, 1))
open(sys.argv[1] if len(sys.argv) > 1 else '../moahub-promo.srt', 'w', encoding='utf-8').write(out)
print(len(subs), 'subs')
