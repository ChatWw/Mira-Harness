import { execFileSync } from 'node:child_process';
const [selectorInput, action = 'click', value = ''] = process.argv.slice(2);
const kind = selectorInput.startsWith('page:') ? 'page' : 'iframe';
const selector = selectorInput.replace(/^page:/, '');
const [elementSelector, textMatch] = selector.split(' >> ');
async function evaluate(type, expression) {
  const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const target = targets.find(item => item.type === type);
  if (!target) throw new Error('Target unavailable');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => socket.onopen = resolve);
  socket.send(JSON.stringify({id: 1, method: 'Runtime.evaluate', params: {expression, returnByValue: true}}));
  const response = await new Promise(resolve => socket.onmessage = event => { const data = JSON.parse(event.data); if (data.id === 1) resolve(data); });
  socket.close();
  if (response.result.exceptionDetails) throw new Error(response.result.exceptionDetails.exception?.description || response.result.exceptionDetails.text);
  return response.result.result.value;
}
let box;
let lastBox;
for(let attempt=0;attempt<25;attempt++) {
  try {
    box = await evaluate(kind, `(()=>{const es=[...document.querySelectorAll(${JSON.stringify(elementSelector)})].filter(e=>{const r=e.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.width>0&&r.height>0&&r.top>=0&&r.bottom<=innerHeight&&hit&&e.contains(hit)});const e=${textMatch === undefined ? 'es[0]' : `es.find(e=>e.innerText.trim()===${JSON.stringify(textMatch)})`};if(!e)throw Error('Missing visible element');if(e.disabled)throw Error('Element disabled');const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height}})()`);
    if (box.w && box.h && JSON.stringify(box) === JSON.stringify(lastBox)) break;
    lastBox = box;
    await new Promise(resolve=>setTimeout(resolve,150));
  }
  catch(error) { if(attempt===24)throw error; await new Promise(resolve=>setTimeout(resolve,200)); }
}
if (!box.w || !box.h) throw new Error('Element hidden');
const frame = kind === 'page' ? {x:0,y:0} : await evaluate('page', 'document.querySelector("iframe").getBoundingClientRect().toJSON()');
const windows = JSON.parse(execFileSync('/tmp/mira-zcode-cu', ['windows', 'Electron'], {encoding:'utf8'}));
const window = windows.find(item => item.kCGWindowLayer === 0 && item.kCGWindowBounds.Width > 500 && item.kCGWindowName?.includes('Mira'));
if (!window) throw new Error('Mira main window unavailable');
const bounds = window.kCGWindowBounds;
execFileSync('/tmp/mira-zcode-cu', ['focus', String(window.kCGWindowOwnerPID)]);
execFileSync('osascript', ['-e', `tell application "System Events" to set frontmost of first process whose unix id is ${window.kCGWindowOwnerPID} to true`]);
await new Promise(resolve => setTimeout(resolve, 200));
const x = String(bounds.X + frame.x + box.x), y = String(bounds.Y + frame.y + box.y);
execFileSync('/tmp/mira-zcode-cu', ['click', x, y, ...(['right', 'middle'].includes(action) ? [action] : [])]);
if (action === 'type') execFileSync('/tmp/mira-zcode-cu', ['type', value]);
console.log(JSON.stringify({selector, action, x, y}));
