"""Собирает Telegram Mini App / PWA из dose-calculator.html.

Запуск:  python build.py
Результат: index.html рядом с этим файлом (manifest, sw.js и иконки уже лежат здесь).
После каждого изменения калькулятора запустите сборку и увеличьте VERSION в sw.js,
чтобы у пользователей обновился офлайн-кэш.
"""
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE.parent / "dose-calculator.html"

src = SRC.read_text(encoding="utf-8")
cut = src.index("</style>") + len("</style>")
head_part, body_part = src[:cut], src[cut:]
# служебный тег артефакта Claude в автономной странице не нужен
head_part = "\n".join(l for l in head_part.splitlines() if "claude:viewport-fit-sides" not in l)

HEAD = """<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#2445C4">
<meta name="description" content="Калькулятор доз лекарств по возрасту, весу и росту; укладка СМП по приказу 1165н.">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" href="icon-192.png">
<link rel="apple-touch-icon" href="icon-180.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Дозировки">
<script src="https://telegram.org/js/telegram-web-app.js" async id="tgScript"></script>
<style>
:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
body{margin:0;font-size:14px;-webkit-text-size-adjust:100%}
img{max-width:100%}
[hidden]{display:none!important}
.net{font-size:12.5px;color:var(--muted)}
.net b{color:var(--ok);font-weight:600}
.net.off b{color:var(--warn)}
html.tg .top .wrap{padding-block:12px}
</style>
"""

TAIL = r"""
<script>
(function(){
  /* ---- Telegram Mini App ---- */
  function hex(c){var m=c.match(/\d+/g);if(!m)return null;return '#'+m.slice(0,3).map(function(x){return ('0'+(+x).toString(16)).slice(-2);}).join('');}
  function initTg(){
    var tg=window.Telegram&&window.Telegram.WebApp;
    if(!tg||tg.platform==='unknown')return;
    document.documentElement.classList.add('tg');
    try{tg.ready();tg.expand();}catch(e){}
    try{if(tg.disableVerticalSwipes)tg.disableVerticalSwipes();}catch(e){}
    function apply(){
      document.documentElement.setAttribute('data-theme',tg.colorScheme==='dark'?'dark':'light');
      var bg=getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()||hex(getComputedStyle(document.body).backgroundColor);
      try{if(bg){tg.setHeaderColor(bg);tg.setBackgroundColor(bg);}}catch(e){}
    }
    apply();
    try{tg.onEvent('themeChanged',apply);}catch(e){}
  }
  if(window.Telegram&&window.Telegram.WebApp)initTg();
  else{var s=document.getElementById('tgScript');if(s)s.addEventListener('load',initTg);}

  /* ---- офлайн-режим ---- */
  var foot=document.querySelector('footer');
  var net=document.createElement('p');net.className='net';
  if(foot)foot.insertBefore(net,foot.firstChild);
  var ready=false;
  function paint(){
    if(!navigator.onLine){net.className='net off';net.innerHTML='<b>Нет сети</b> — калькулятор работает из сохранённой копии.';}
    else if(ready){net.className='net';net.innerHTML='<b>Сохранено на устройстве</b> — калькулятор будет работать и без интернета.';}
    else net.textContent='';
  }
  window.addEventListener('online',paint);window.addEventListener('offline',paint);
  if('serviceWorker' in navigator){
    window.addEventListener('load',function(){
      navigator.serviceWorker.register('sw.js').then(function(){return navigator.serviceWorker.ready;}).then(function(){ready=true;paint();}).catch(function(){paint();});
    });
  }
  paint();
})();
</script>
</body>
</html>
"""

out = HEAD + "\n".join(l for l in head_part.splitlines()) + "\n</head>\n<body>\n" + body_part.strip() + "\n" + TAIL
(HERE / "index.html").write_text(out, encoding="utf-8")
print("index.html:", len(out), "символов")
