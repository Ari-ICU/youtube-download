import subprocess, time

p = subprocess.Popen(
    ['yt-dlp', '--newline', '--progress',
     '--extractor-args', 'youtube:player_client=web,android,android_vr',
     '--no-warnings', '-f', '18', '-o', '/tmp/prog-py-test.mp4', '--no-part',
     'https://www.youtube.com/watch?v=fze9tASaMao'],
    stderr=subprocess.PIPE, stdout=subprocess.DEVNULL
)
start = time.time()
while time.time() - start < 8:
    line = p.stderr.readline()
    if not line:
        break
    print(repr(line.decode('utf-8', errors='replace')))
p.kill()
