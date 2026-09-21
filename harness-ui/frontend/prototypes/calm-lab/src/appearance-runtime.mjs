import {appearancePolicy,validateAppearance} from './appearance-domain.mjs';
export function applyFullAppearance(value,doc=globalThis.document){
 const p=validateAppearance(value),win=doc.defaultView,root=doc.documentElement;
 const dark=p.colorMode==='system'?!win.matchMedia('(prefers-color-scheme: light)').matches:p.colorMode==='dark';
 const policy=appearancePolicy(p,{reduced:win.matchMedia('(prefers-reduced-motion: reduce)').matches,hidden:doc.hidden,saveData:!!win.navigator.connection?.saveData});
 root.dataset.mode=dark?'dark':'light';root.dataset.talosTheme=p.themePreset;
 if(dark)root.removeAttribute('data-theme');else root.dataset.theme='light';
 root.dataset.talosColorMode=p.colorMode;root.dataset.talosResolvedColorMode=dark?'dark':'light';root.dataset.talosScene=policy.scene;
 root.dataset.density=p.uiDensity==='compatta'?'compact':'comfortable';root.dataset.motion=policy.interfaceMotion?'on':'off';root.dataset.talosMotionMode=p.motionMode;root.dataset.talosMotionQuality=p.motionQuality;
 const ui={xsmall:.8,small:.9,default:1,large:1.15,xlarge:1.3};const chat={xcompact:'.875rem',compact:'.9375rem',balanced:'1.0625rem',expanded:'1.1875rem'};
 root.style.setProperty('--base-size',(16*ui[p.uiFontScale])+'px');root.style.setProperty('--preview-chat-size',chat[p.chatFontScale]);
 const variables={motionSpeed:'speed',motionIntensity:'intensity',motionGlow:'glow',motionDensity:'density',motionDepth:'depth',motionTrails:'trails',motionContrast:'contrast',motionParallax:'parallax'};
 for(const [key,id] of Object.entries(variables))root.style.setProperty('--talos-motion-'+id,String(p[key]/100));
 const curves={precise:'cubic-bezier(.2,.8,.2,1)',soft:'cubic-bezier(.22,1,.36,1)','elastic-light':'cubic-bezier(.2,1.1,.3,1)',linear:'linear',cinematic:'cubic-bezier(.76,0,.24,1)'};
 const factor=p.motionProfile==='minimal'?.72:p.motionProfile==='expressive'?1.24:1;
 root.style.setProperty('--motion',policy.interfaceMotion?Math.round(160*p.motionDuration/100*factor)+'ms':'0ms');root.style.setProperty('--ease',curves[p.motionEasing]);
 root.style.setProperty('--appearance-stagger',p.motionStagger+'ms');root.style.setProperty('--appearance-distance',(p.motionUiIntensity*.08)+'px');
 for(const key of ['composerShape','composerPlus','messageStyle','streamingAnimation','windowPresentation','motionProfile','motionEasing'])root.dataset['preview'+key[0].toUpperCase()+key.slice(1)]=p[key];
 for(const key of ['immersiveHeader','chatFullWidth','motionWindows','motionSurfaces','motionNavigation','motionComposer','motionMessages','motionFeedback'])root.dataset['preview'+key[0].toUpperCase()+key.slice(1)]=String(p[key]);
 // Swatches read actual stylesheet seeds, never a parallel palette.
 if(!root.dataset.calmSwatches){root.dataset.calmSwatches='ready';for(const sheet of [...doc.styleSheets]){let rules=[];try{rules=[...sheet.cssRules];}catch{continue;}for(const rule of rules){const match=/^:root\[data-talos-theme="([a-z]+)"\]$/.exec(rule.selectorText||'');const color=rule.style?.getPropertyValue('--talos-seme-accento')?.trim();if(match&&color)root.style.setProperty('--swatch-'+match[1],color);}}
 }
 return policy;
}

export function createAppearancePreviewManager(doc=globalThis.document){
 const win=doc.defaultView;let current=null,frame=0,last=0,config=null,observer=null,disposed=false,probe=null;
 const setCaption=(text,status)=>{if(current?.caption){current.caption.textContent=text;current.canvas.dataset.status=status;}};
 function resolvedColor(property,fallback){if(!probe){probe=doc.createElement('span');probe.style.cssText='position:fixed;visibility:hidden;pointer-events:none';probe.setAttribute('aria-hidden','true');doc.body.append(probe);}probe.style.color='';probe.style.color=getComputedStyle(doc.documentElement).getPropertyValue(property)||fallback;return getComputedStyle(probe).color;}
 function prepare(){if(!current||!config)return;const {host,canvas}=current;const rect=host.getBoundingClientRect();const dpr=Math.min(1.5,win.devicePixelRatio||1);const width=Math.max(1,rect.width),height=Math.max(1,rect.height);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);current.dpr=dpr;
  const fields={accent:['--accent','#c08b3c'],secondary:['--muted','#8e9095'],border_strong:['--line','#4a4b50'],surface_elevated:['--card','#34353a'],background:['--bg','#1e1f22'],focus:['--ring','#d8a650'],info:['--muted','#7f9fc4'],success:['--success','#77a884'],warning:['--warning','#d8a650'],danger:['--danger','#d87d72']};const palette=Object.fromEntries(Object.entries(fields).map(([k,[token,fallback]])=>[k,resolvedColor(token,fallback)]));
  const p=config.value,policy=config.policy;const parameters={speed:p.motionSpeed,intensity:p.motionIntensity,glow:p.motionGlow,density:p.motionDensity,depth:p.motionDepth,trails:p.motionTrails,contrast:p.motionContrast,parallax:p.motionParallax};
  const definition=(win.TalosMobileScenes||[]).find(s=>s.id===policy.scene);
  if(definition!==current.definition){current.definition=definition;current.state=definition?.createState(730913);}
  if(!definition)return;
  current.input={viewport:{width,height},palette:{dark:palette,light:palette},colorMode:doc.documentElement.dataset.mode,parameters,effectiveQuality:{tier:policy.quality,densityScale:p.motionMode==='simple'?.45:policy.quality==='low'?.55:policy.quality==='high'?1.2:1}};
  try{current.geometry=definition.prepare({state:current.state,input:current.input}).geometry;}catch{current.definition=null;setCaption('Scena non disponibile','error');}
 }
 function draw(dt=0){if(!current)return;const {context,canvas,dpr,definition}=current;context.setTransform(dpr,0,0,dpr,0,0);context.clearRect(0,0,canvas.width,canvas.height);
  if(config.policy.background==='off'){setCaption('Scena spenta · scelta predefinita','off');return;}
  if(!definition){setCaption('Scena non disponibile','error');return;}
  try{if(dt)definition.update({state:current.state,input:current.input,stepMs:dt});definition.draw({context,state:current.state,geometry:current.geometry});setCaption(config.policy.background==='animated'?'Scena attiva · '+config.policy.scene:config.policy.background==='paused'?'Scena sospesa':'Fotogramma fermo · movimento ridotto o renderer statico',config.policy.background);}catch{current.definition=null;setCaption('Errore di rendering della scena','error');}
 }
 function animate(now){frame=0;if(!current||!config||disposed||config.policy.background!=='animated'||doc.hidden)return;const elapsed=last?now-last:34;if(elapsed>=33){last=now;draw(Math.min(50,elapsed));}frame=win.requestAnimationFrame(animate);}
 function stop(){win.cancelAnimationFrame(frame);frame=0;last=0;observer?.disconnect();observer=null;current?.canvas.remove();current=null;}
 function refresh(value){if(disposed)return;const modal=doc.querySelector('dialog[open]');const host=(modal||doc).querySelector('[data-preview-scene]');if(!host){stop();return;}config={value,policy:appearancePolicy(value,{reduced:win.matchMedia('(prefers-reduced-motion: reduce)').matches,hidden:doc.hidden,saveData:!!win.navigator.connection?.saveData})};
  if(current?.host!==host){stop();const canvas=doc.createElement('canvas');canvas.className='appearance-canvas';canvas.setAttribute('aria-hidden','true');host.prepend(canvas);const context=canvas.getContext('2d');if(!context){canvas.remove();return;}current={host,canvas,context,caption:host.querySelector('[data-scene-caption]')};observer=new win.ResizeObserver(()=>{prepare();draw();});observer.observe(host);}
  win.cancelAnimationFrame(frame);frame=0;last=0;prepare();draw();if(config.policy.background==='animated'&&!doc.hidden)frame=win.requestAnimationFrame(animate);
 }
 const visibility=()=>{if(config)refresh(config.value);};doc.addEventListener('visibilitychange',visibility);
 return {refresh,dispose(){disposed=true;stop();probe?.remove();doc.removeEventListener('visibilitychange',visibility);}};
}
