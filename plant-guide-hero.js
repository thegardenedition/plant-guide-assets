/* plant-guide-hero.js — 식물도감 히어로 키네틱 띠 (백로그 44, 시안 v6 대표 확정 10-05).
   plant-guide.js 가 페이지에 #pherovid(그릇, 디자인 세션 마크업)가 있을 때만 이 파일을 load 뒤 유휴에 동적으로 불러온다 — 그릇이 없는 페이지(기사 포함)는 요청 0.
   · 데스크톱(≥1024px)·움직임 줄이기 아님: 15초(96BPM 6마디) 루프 재생, 「소리 켜기」(기본 무음·클릭할 때만 AudioContext 생성·저장 안 함)·「일시정지」(aria-pressed).
   · 1024px 미만(모바일·태블릿): 같은 15초 장면을 세로형 무대(높이 280px 고정, 소리 없음·일시정지만, 작은 사진 hero/img/m/)로 재생한다. 움직임 줄이기·데이터 절약·2G·저사양은 정지 컷 한 장(애니메이션·소리 없음). 창 폭이 바뀌면 즉시 전환하고 소리는 끈다.
   · 띠가 화면 밖이거나 탭이 숨겨지면 자동 일시정지(소리 포함), 돌아오면 이어서 재생(사용자가 직접 멈춘 경우는 그대로 멈춤).
   · 사진 5장은 hero/img/*.webp (대표 직접 촬영), 글꼴은 Pretendard Variable 서브셋 CSS 를 재생 시작 때만 불러온다(실패하면 사이트 기본 Pretendard 로 계속).
   · 등장(대표 10-07): 띠는 히어로 뒤에 있어 스크롤로 보이게 될 때 서서히 나타나며(투명도 0→1 + 10px 아래→위, 0.6초, 한 번만) 그때 재생이 시작된다(화면 밖에서는 재생·소리 없음). 움직임 줄이기·IntersectionObserver 없음이면 기다리지 않고 바로 보인다.
   · 끄기: 그릇 제거 또는 주소 ?pghero=0. 높이는 plant-guide.css 의 #pherovid 규칙(aspect-ratio)이 미리 잡아 CLS 0. */
(function(){
'use strict';
if(window.__pgHero)return;
var host=document.getElementById('pherovid');
if(!host)return;
window.__pgHero=1;
try{if(/[?&]pghero=0(&|$)/.test(location.search))return;}catch(e){}

var BASE=window.__PG_HERO_BASE||'https://thegardenedition.github.io/plant-guide-assets/';
var PHOTO_FILES=['hero-grass-v1.webp','hero-sedge-v1.webp','hero-salvia-v1.webp','hero-bee-flower-v1.webp','hero-garden-v1.webp'];
var FONT_CSS='https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css';
var BPM=96,B=60/BPM,BAR=4*B,BARS=6,LOOP=BARS*BAR,STEP=B/4,STEPS=BARS*16;
var STILL_T=22*B; /* 정지 컷: 「정원이 보인다」 */
var PHOTOS=5,ENTRY=[0,4,8,12,20];

function cl(x){return x<0?0:x>1?1:x;}
function bez(x1,y1,x2,y2){return function(x){if(x<=0)return 0;if(x>=1)return 1;var t=x;for(var i=0;i<8;i++){var u=1-t,cx=3*x1*t*u*u+3*x2*t*t*u+t*t*t-x,dx=3*x1*u*u+6*(x2-x1)*t*u+3*(1-x2)*t*t;if(Math.abs(cx)<1e-5||Math.abs(dx)<1e-6)break;t=cl(t-cx/dx);}var v=1-t;return 3*y1*t*v*v+3*y2*t*t*v+t*t*t;};}
var SIG=bez(.16,1,.3,1),OUT=bez(.7,0,.84,0),INK=bez(.65,0,.35,1),SNAP=bez(.22,1,.36,1);
function P(t,b,d){return cl((t-b*B)/(d*B));}
function kick(t){var ph=(t%(2*B))/(2*B);return Math.exp(-ph*6);}

/* ── 스타일(이 파일이 불러와질 때만 주입, 선택자는 전부 #pherovid 아래) ── */
(function(){
  if(document.getElementById('pgh-style'))return;
  var s=document.createElement('style');s.id='pgh-style';
  s.textContent=
'#pherovid{--pgh-ink:#0A0A0A;--pgh-g1:#6E6E6E;--pgh-line:#E6E6E6;--pgh-green:#0B5345;--pgh-font:"Pretendard Variable",Pretendard,"Apple SD Gothic Neo","Noto Sans KR",system-ui,sans-serif}'+
'#pherovid .pgh-stage{position:absolute;left:0;top:0;width:1440px;height:200px;transform-origin:0 0;font-family:var(--pgh-font);word-break:keep-all}'+
'#pherovid .pgh-eye{position:absolute;left:144px;top:22px;width:636px;display:flex;justify-content:space-between;align-items:center;font-weight:600;font-size:12px;letter-spacing:.24em;color:var(--pgh-g1)}'+
'#pherovid .pgh-eye b{font-weight:700;color:var(--pgh-ink)}'+
'#pherovid .pgh-ctr{display:inline-flex;gap:.6em;letter-spacing:.12em;font-variant-numeric:tabular-nums}'+
'#pherovid .pgh-nw{position:relative;display:inline-block;width:1.5em;height:1.3em;overflow:hidden;vertical-align:bottom}'+
'#pherovid .pgh-n{position:absolute;left:0;top:0;color:var(--pgh-ink)}'+
'#pherovid .pgh-hl{position:absolute;left:144px;top:48px;white-space:nowrap;font-size:96px;line-height:1.18;letter-spacing:-.045em;color:var(--pgh-ink);font-weight:800;visibility:hidden}'+
'#pherovid .pgh-m{display:inline-block;overflow:hidden;vertical-align:top;height:1.18em;padding:0 .02em}'+
'#pherovid .pgh-c{display:inline-block;will-change:transform;transform:translateY(110%)}'+
'#pherovid .pgh-g{color:var(--pgh-green)}'+
'#pherovid .pgh-chips{position:absolute;left:144px;top:92px;display:flex;gap:10px;visibility:hidden}'+
'#pherovid .pgh-chip{position:relative;overflow:hidden;height:38px;padding:0 18px;border:1.5px solid var(--pgh-ink);border-radius:0;font-weight:600;font-size:16px;line-height:35px;letter-spacing:-.01em;color:var(--pgh-ink);will-change:transform}'+
'#pherovid .pgh-chip i{position:absolute;inset:-1px;background:var(--pgh-green);transform-origin:0 50%;transform:scaleX(0)}'+
'#pherovid .pgh-chip span{position:relative}'+
'#pherovid .pgh-dot{position:absolute;left:0;top:0;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:var(--pgh-green);will-change:transform}'+
'#pherovid .pgh-rail{position:absolute;left:144px;top:178px;width:636px;height:1px;background:var(--pgh-line)}'+
'#pherovid .pgh-rail i{position:absolute;left:0;top:-1px;width:100%;height:3px;background:var(--pgh-green);transform-origin:0 50%;transform:scaleX(0)}'+
'#pherovid .pgh-win{position:absolute;left:840px;top:0;width:600px;height:200px;overflow:hidden;background:#EDEDEA}'+
'#pherovid .pgh-lay{position:absolute;inset:0;visibility:hidden}'+
'#pherovid .pgh-sl{position:absolute;top:0;width:100px;height:200px;overflow:hidden;will-change:transform}'+
'#pherovid .pgh-sl b{position:absolute;top:-60px;width:600px;height:320px;background-position:center;background-size:cover;background-repeat:no-repeat;will-change:transform}'+
'#pherovid .pgh-cor{position:absolute;width:26px;height:26px;border:0 solid #fff;opacity:0;z-index:3}'+
'#pherovid .pgh-scan{position:absolute;left:0;top:0;width:600px;height:1px;background:rgba(255,255,255,.85);box-shadow:0 0 12px rgba(255,255,255,.6);opacity:0;z-index:3}'+
'#pherovid .pgh-ctl{position:absolute;bottom:12px;height:30px;min-width:30px;border:0;border-radius:0;background:rgba(255,255,255,.92);color:var(--pgh-ink);font:600 12px var(--pgh-font);cursor:pointer;display:grid;place-items:center;z-index:6;padding:0 10px;box-shadow:0 8px 24px -10px rgba(0,0,0,.3);transition:transform .5s cubic-bezier(.16,1,.3,1)}'+
'#pherovid .pgh-ctl:hover{transform:translateY(-1px)}#pherovid .pgh-ctl:active{transform:scale(.97)}#pherovid .pgh-ctl:focus-visible{outline:2px solid var(--pgh-green);outline-offset:2px}'+
'#pherovid .pgh-ctl[hidden]{display:none}'+
'#pherovid[data-pgw="narrow"] .pgh-ctl{height:40px;min-width:40px}'+
'@media (pointer:coarse){#pherovid[data-pgw="wide"] .pgh-ctl{height:40px;min-width:40px}#pherovid[data-pgw="wide"] .pgh-sound{right:58px}}'+
'#pherovid[data-pgh-nophoto] .pgh-win{background:var(--pgh-green)}'+
'#pherovid .pgh-pause{right:12px}#pherovid .pgh-sound{right:50px}'+
'@media (prefers-reduced-motion:reduce){#pherovid .pgh-ctl{transition:none}}';
  document.head.appendChild(s);
})();

/* ── DOM 만들기 ── */
function el(tag,cls,parent,txt){var e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;if(parent)parent.appendChild(e);return e;}
var stage=el('div','pgh-stage',host);stage.setAttribute('aria-hidden','true');
var eye=el('div','pgh-eye',stage);
var eyeL=el('span','',eye);el('b','',eyeL,'MAGAZINE GREEN');eyeL.appendChild(document.createTextNode('  PLANT GUIDE'));
var ctr=el('span','pgh-ctr',eye);var nw=el('span','pgh-nw',ctr);var nA=el('span','pgh-n',nw,'06'),nB=el('span','pgh-n',nw,'01');el('span','',ctr,'/ 06');
var LINES={};
function mkLine(key,txt,g){var h=el('div','pgh-hl',stage);var cs=[],ms=[];var gg=g||[-1,-1];
  txt.split('').forEach(function(ch,i){var m=el('span','pgh-m',h);var c=el('span','pgh-c'+(i>=gg[0]&&i<gg[1]?' pgh-g':''),m,ch===' '?' ':ch);cs.push(c);ms.push(m);});
  LINES[key]={el:h,cs:cs,ms:ms};}
mkLine('t1','식물도감');mkLine('t2a','이름으로');mkLine('t2b','사진으로');mkLine('t2c','찾고');
var chipsEl=el('div','pgh-chips',stage);var CHIPS=['꽃 색상','햇빛','식물 유형'].map(function(t){var c=el('div','pgh-chip',chipsEl);var i=el('i','',c);var sp=el('span','',c,t);return {c:c,i:i,sp:sp};});
mkLine('t4','고르고');mkLine('t5','이름을 알면');mkLine('t6','정원이 보인다',[0,2]);
var dot=el('div','pgh-dot',stage);
var rail=el('div','pgh-rail',stage);var prog=el('i','',rail);
var win=el('div','pgh-win',stage);var layers=el('div','',win);
var cors=[['left:22px;top:22px;border-left-width:2px;border-top-width:2px',-1,-1],['right:22px;top:22px;border-right-width:2px;border-top-width:2px',1,-1],['left:22px;bottom:22px;border-left-width:2px;border-bottom-width:2px',-1,1],['right:22px;bottom:22px;border-right-width:2px;border-bottom-width:2px',1,1]].map(function(a){var c=el('div','pgh-cor',win);c.setAttribute('style',a[0]);return {e:c,dx:a[1],dy:a[2]};});
var scan=el('div','pgh-scan',win);
var LAY=[];for(var p=0;p<PHOTOS;p++){var lay=el('div','pgh-lay',layers);var sl=[];
  for(var i=0;i<6;i++){var s=el('div','pgh-sl',lay);s.style.left=(i*100)+'px';var bb=el('b','',s);bb.style.left=(-i*100)+'px';sl.push({s:s,b:bb});}
  LAY.push({el:lay,sl:sl});}
var bSound=el('button','pgh-ctl pgh-sound',host,'소리 켜기');bSound.type='button';
var bPause=el('button','pgh-ctl pgh-pause',host,'❚❚');bPause.type='button';bPause.setAttribute('aria-pressed','false');bPause.setAttribute('aria-label','애니메이션 일시정지');
bSound.hidden=true;bPause.hidden=true;
if(!host.getAttribute('role')){host.setAttribute('role','img');host.setAttribute('aria-label','식물도감. 이름으로 찾고, 사진으로 찾고. 꽃 색상·햇빛·식물 유형으로 고르고. 이름을 알면 정원이 보인다. 오른쪽에 매거진 그린이 찍은 그라스, 사초, 살비아, 꿀벌이 앉은 꽃, 정원 전경 사진이 차례로.');}

/* ── 배치: ≥1024 는 1440×200 무대를 폭 비율로 줄이고(기존), 1024 미만(모바일·태블릿)은 같은 장면을 위아래로 쌓은 세로형 무대(높이 280px 고정, 글 최소 34px)로 그린다 ── */
var MH=280; /* 모바일 무대 높이(px) — plant-guide.css 의 #pherovid 높이(≤1023px)와 같아야 CLS 0 */
var MOB=false,X0=144,GAP=28,FS=96,Y1=48,Y2=48,WINH=200,DRIFT=1,DOTR=8,layMode='';
function isMob(){return window.innerWidth<1024;}
function layout(){
  var w=host.clientWidth||390,mob=isMob(),key,L,i,j;
  var chipsTop,railTop,winTop,winW,slW,gx;
  MOB=mob;wc={};
  if(!mob){
    X0=144;GAP=28;FS=96;Y1=48;Y2=48;WINH=200;DRIFT=1;DOTR=8;chipsTop=92;railTop=178;winTop=0;winW=600;slW=100;
    stage.style.width='1440px';stage.style.height='200px';
    eye.style.left='144px';eye.style.top='22px';eye.style.width='636px';eye.style.fontSize='12px';eye.style.letterSpacing='.24em';
    rail.style.left='144px';rail.style.width='636px';rail.style.top=railTop+'px';
    win.style.left='840px';
  }else{
    gx=w>=640?32:16;X0=gx;FS=Math.max(34,Math.min(50,Math.round(w*.112)));GAP=Math.round(FS*.3);
    var lh=Math.round(FS*1.18);Y1=40;Y2=Y1+lh+4;DOTR=5;
    chipsTop=Y1+Math.round((lh-38)/2);railTop=Y2+lh+10;winTop=railTop+8;WINH=MH-winTop;winW=w;slW=w/6;DRIFT=WINH/200;
    stage.style.width=w+'px';stage.style.height=MH+'px';
    eye.style.left=gx+'px';eye.style.top='14px';eye.style.width=(w-2*gx)+'px';eye.style.fontSize='12px';eye.style.letterSpacing='.14em';
    rail.style.left=gx+'px';rail.style.width=(w-2*gx)+'px';rail.style.top=railTop+'px';
    win.style.left='0px';
  }
  win.style.top=winTop+'px';win.style.width=winW+'px';win.style.height=WINH+'px';
  for(key in LINES){L=LINES[key];L.el.style.fontSize=FS+'px';L.el.style.top=(key==='t4'?Y2:Y1)+'px';if(key!=='t2c'&&key!=='t4')L.el.style.left=X0+'px';}
  chipsEl.style.left=X0+'px';chipsEl.style.top=chipsTop+'px';
  dot.style.width=dot.style.height=(DOTR*2)+'px';dot.style.margin=(-DOTR)+'px 0 0 '+(-DOTR)+'px';
  scan.style.width=winW+'px';
  for(i=0;i<LAY.length;i++)for(j=0;j<LAY[i].sl.length;j++){var o=LAY[i].sl[j];
    o.s.style.left=(j*slW)+'px';o.s.style.width=slW+'px';o.s.style.height=WINH+'px';
    o.b.style.left=(-j*slW)+'px';o.b.style.width=winW+'px';o.b.style.height=Math.round(WINH*1.6)+'px';o.b.style.top=(-Math.round(WINH*.3))+'px';}
  if(layMode!==(mob?'m':'d')){layMode=mob?'m':'d';setPhotoUrls();}
}
function photoUrl(f){return BASE+'hero/img/'+(MOB?'m/'+f.replace('-v1.webp','-m1.webp'):f);}
var photoSet={}; /* 사진 칸에 실제로 걸어 둘 장(정지 컷은 정원 전경 한 장, 재생은 전부) */
function setPhotoUrls(){for(var i=0;i<PHOTO_FILES.length;i++)if(photoSet[i]){var u='url('+photoUrl(PHOTO_FILES[i])+')';LAY[i].sl.forEach(function(o){o.b.style.backgroundImage=u;});}}

/* ── 그리기 ── */
function photoAt(b){var k=0;for(var i=0;i<ENTRY.length;i++)if(b>=ENTRY[i])k=i;return k;}
function spanOf(p){return (p+1<ENTRY.length?ENTRY[p+1]:24)-ENTRY[p];}
function line(id,t,o){
  var L=LINES[id],b=t/B;
  if(o.x!=null)L.el.style.left=o.x+'px';
  var vis=b>=o.bIn-.01&&b<o.bOut+.8;
  L.el.style.visibility=vis?'visible':'hidden';if(!vis)return;
  for(var i=0;i<L.cs.length;i++){
    var pin=SIG(P(t,o.bIn+i*(o.st||.06),1.05)),pout=OUT(P(t,o.bOut+i*.03,.42));
    var y=110*(1-pin)-112*pout,sk=(1-pin)*8-pout*6;
    var w=o.w0;if(o.w1!=null){w=o.w0+(o.w1-o.w0)*INK(P(t,o.bW+i*(o.wst||.125),1.4));}
    var c=L.cs[i];c.style.transform='translateY('+y.toFixed(2)+'%) skewY('+sk.toFixed(2)+'deg)';c.style.fontWeight=Math.round(w);
  }
}
function lineRight(id){var L=LINES[id],m=L.ms[L.ms.length-1];return parseFloat(L.el.style.left||X0)+m.offsetLeft+m.offsetWidth;}
function lineWidth(id){var L=LINES[id];var m=L.ms[L.ms.length-1];return m.offsetLeft+m.offsetWidth;}
function dotY(id){return MOB?(id==='t4'?Y2:Y1)+FS*.92:48+96*.92;} /* 점은 글줄 밑단 옆 */
var wc={};
function cached(k,f){return k in wc?wc[k]:(wc[k]=f());}
if(document.fonts&&document.fonts.addEventListener)document.fonts.addEventListener('loadingdone',function(){wc={};});
function render(t){
  var b=t/B,bar=Math.floor(b/4)%BARS,k=kick(t);
  line('t1',t,{bIn:0,st:.06,w0:200,w1:800,bW:1,wst:.5,bOut:3.5});
  line('t2a',t,{bIn:4,w0:800,bOut:8});
  line('t2b',t,{bIn:8.05,w0:800,bOut:11.55});
  var ax=X0,aw=cached('aw',function(){return Math.max(LINES.t2a.el.offsetWidth,LINES.t2b.el.offsetWidth);});
  line('t2c',t,{bIn:5,w0:200,w1:800,bW:6,wst:.25,bOut:11.55,x:ax+aw+GAP});
  var chOn=b>=12&&b<16.3;chipsEl.style.visibility=chOn?'visible':'hidden';
  CHIPS.forEach(function(o,i){var pin=SIG(P(t,12+i*.12,1)),pout=OUT(P(t,15.5+i*.04,.42));
    o.c.style.transform='translateY('+(60*(1-pin)-60*pout).toFixed(2)+'px)';o.c.style.opacity=(pin*(1-pout)).toFixed(3);
    var sel=SNAP(P(t,12.5+i*.5,.6));o.i.style.transform='scaleX('+sel.toFixed(4)+')';o.sp.style.color=sel>.55?'#fff':'#0A0A0A';});
  var chw=cached('chw',function(){return chipsEl.offsetWidth;})||330;
  line('t4',t,{bIn:12.4,st:.08,w0:200,w1:800,bW:14,wst:.2,bOut:15.55,x:MOB?X0:144+chw+28});
  line('t5',t,{bIn:16,st:.07,w0:250,bOut:19.55});
  line('t6',t,{bIn:20,st:.07,w0:800,bOut:23.2});
  var pn=SIG(P(t,bar*4,.8));nA.textContent=('0'+(bar===0?6:bar)).slice(-2);nB.textContent=('0'+(bar+1)).slice(-2);
  nA.style.transform='translateY('+(-110*pn)+'%)';nB.style.transform='translateY('+(110*(1-pn))+'%)';
  var from=bar===0?1:bar/6,to=(bar+1)/6;prog.style.transform='scaleX('+(from+(to-from)*SIG(P(t,bar*4,1.2))).toFixed(4)+')';
  var cur=photoAt(b),prev=(cur+PHOTOS-1)%PHOTOS,eB=ENTRY[cur],entering=b<eB+1.65;
  LAY.forEach(function(L,pi){var on=(pi===cur)||(pi===prev&&entering);L.el.style.visibility=on?'visible':'hidden';L.el.style.zIndex=pi===cur?2:1;});
  LAY[cur].sl.forEach(function(o,i){var pin=SIG(P(t,eB+i*.1,1.1));o.s.style.transform='translateY('+(100*(1-pin)).toFixed(2)+'%)';
    var dr=P(t,eB,spanOf(cur));o.b.style.transform='translateY('+(-14*DRIFT*dr).toFixed(2)+'px) scale('+(1.07-.04*SIG(P(t,eB,3))+.03*dr).toFixed(4)+')';});
  if(entering)LAY[prev].sl.forEach(function(o){o.s.style.transform='translateY(0%)';o.b.style.transform='translateY('+(-14*DRIFT)+'px) scale(1.06)';});
  var cp=SIG(P(t,8,1)),cq=OUT(P(t,11.55,.45)),onC=b>=8&&b<12;
  cors.forEach(function(c){var d=26*(1-cp);c.e.style.transform='translate('+(c.dx*d)+'px,'+(c.dy*d)+'px)';c.e.style.opacity=onC?(cp*(1-cq)).toFixed(3):0;});
  var sp=INK(P(t,8.6,1.6));scan.style.transform='translateY('+(WINH*sp).toFixed(1)+'px)';scan.style.opacity=(b>=8.6&&b<10.2)?Math.sin(Math.PI*sp).toFixed(3):0;
  var target=['t1','t2c','t2c','t4','t5','t6'][bar];
  var x=lineRight(target)+16;
  var nxt=['t2c','t2c','t4','t5','t6','t1'][bar];
  var nx=lineRight(nxt)+16,mv=SIG(P(t,bar*4+3.1,.85)),dy=dotY(target),dny=dotY(nxt);
  if(bar===1){x=X0+aw+GAP+lineWidth('t2c')+16;nx=x;}
  if(bar===2){x=X0+aw+GAP+lineWidth('t2c')+16;}
  dot.style.transform='translate('+(x+(nx-x)*mv).toFixed(1)+'px,'+(dy+(dny-dy)*mv).toFixed(1)+'px) scale('+(1+.12*k).toFixed(3)+')';
}

/* ── 오디오(96BPM, 클릭할 때만 만든다) ── */
var ROOT=[110,87.31,130.81,98.0,110,87.31];
var CHORD=[[220,261.63,329.63],[174.61,220,261.63],[196,261.63,329.63],[196,246.94,293.66],[220,261.63,329.63],[174.61,220,261.63]];
var nCache=null;
function nBuf(ctx){if(nCache&&nCache.ctx===ctx)return nCache.buf;var n=ctx.sampleRate,buf=ctx.createBuffer(1,n,ctx.sampleRate),d=buf.getChannelData(0);for(var i=0;i<n;i++)d[i]=Math.random()*2-1;nCache={ctx:ctx,buf:buf};return buf;}
function env(g,t,pk,a,d){g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(pk,t+a);g.gain.exponentialRampToValueAtTime(.0001,t+a+d);}
function kickV(ctx,out,t){var o=ctx.createOscillator(),g=ctx.createGain();o.frequency.setValueAtTime(120,t);o.frequency.exponentialRampToValueAtTime(42,t+.16);env(g,t,.85,.005,.42);o.connect(g);g.connect(out);o.start(t);o.stop(t+.5);}
function noiseV(ctx,out,t,type,f,q,pk,d){var s=ctx.createBufferSource();s.buffer=nBuf(ctx);var fl=ctx.createBiquadFilter();fl.type=type;fl.frequency.value=f;fl.Q.value=q;var g=ctx.createGain();env(g,t,pk,.002,d);s.connect(fl);fl.connect(g);g.connect(out);s.start(t);s.stop(t+d+.05);}
function rimV(ctx,out,t){noiseV(ctx,out,t,'bandpass',2200,1.2,.16,.09);}
function hatV(ctx,out,t,v){noiseV(ctx,out,t,'highpass',8500,.7,.05*v,.05);}
function bassV(ctx,out,t,f,dur){var o=ctx.createOscillator();o.type='triangle';o.frequency.value=f;var g=ctx.createGain();env(g,t,.42,.01,dur);o.connect(g);g.connect(out);o.start(t);o.stop(t+dur+.05);}
function padV(ctx,out,t,notes,dur){var fl=ctx.createBiquadFilter();fl.type='lowpass';fl.frequency.value=1100;fl.Q.value=.6;var g=ctx.createGain();g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.06,t+.35);g.gain.setValueAtTime(.06,t+dur-.4);g.gain.exponentialRampToValueAtTime(.0001,t+dur);fl.connect(g);g.connect(out);
  notes.forEach(function(f){[-5,5].forEach(function(dt){var o=ctx.createOscillator();o.type='sawtooth';o.frequency.value=f;o.detune.value=dt;o.connect(fl);o.start(t);o.stop(t+dur+.02);});});}
function pluckV(ctx,out,t,f){var o=ctx.createOscillator();o.type='sine';o.frequency.value=f;var g=ctx.createGain();env(g,t,.06,.004,.36);o.connect(g);g.connect(out);o.start(t);o.stop(t+.42);}
function tickV(ctx,out,t,f){var o=ctx.createOscillator();o.type='sine';o.frequency.value=f;var g=ctx.createGain();env(g,t,.24,.002,.11);o.connect(g);g.connect(out);o.start(t);o.stop(t+.14);noiseV(ctx,out,t,'highpass',6000,.8,.06,.012);}
function whooshV(ctx,out,t,dur,up){var s=ctx.createBufferSource();s.buffer=nBuf(ctx);s.loop=true;var fl=ctx.createBiquadFilter();fl.type='bandpass';fl.Q.value=.9;fl.frequency.setValueAtTime(up?600:3200,t);fl.frequency.exponentialRampToValueAtTime(up?3200:600,t+dur);var g=ctx.createGain();g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.07,t+dur*.45);g.gain.exponentialRampToValueAtTime(.0001,t+dur);s.connect(fl);fl.connect(g);g.connect(out);s.start(t);s.stop(t+dur+.02);}
function schedStep(ctx,out,s,time){
  var bar=Math.floor(s/16),pos=s%16;
  if(pos===0||pos===8)kickV(ctx,out,time);
  if(pos===4||pos===12)rimV(ctx,out,time);
  if(pos%2===0)hatV(ctx,out,time,pos%4===2?1:.6);
  if(pos===0)bassV(ctx,out,time,ROOT[bar],1.1);
  if(pos===8)bassV(ctx,out,time,ROOT[bar],.9);
  if(pos===0)padV(ctx,out,time,CHORD[bar],BAR);
  if(bar>=1&&pos%2===0&&!(bar===3&&(pos===2||pos===4||pos===6))){var n=CHORD[bar];pluckV(ctx,out,time,n[(pos/2)%3]*2);}
  if(bar===3&&(pos===2||pos===4||pos===6))tickV(ctx,out,time,[1318.5,1568,1760][(pos-2)/2]);
  if(pos===14&&bar!==3)whooshV(ctx,out,time,.45,true);
}
function master(ctx){var c=ctx.createDynamicsCompressor();c.threshold.value=-18;c.ratio.value=3;c.attack.value=.005;c.release.value=.2;var g=ctx.createGain();g.gain.value=.5;c.connect(g);g.connect(ctx.destination);return c;}

/* ── 재생 제어 ── */
var paused=false,userPaused=false,autoPaused=false,soundOn=false,ctx=null,out=null,origin=0,pOrigin=performance.now()/1000,tFrozen=0,nextStep=0,nextTime=0,timer=null,started=false,fontsOk=false;
var mqReduce=window.matchMedia?window.matchMedia('(prefers-reduced-motion: reduce)'):null;
function reduced(){return !!(mqReduce&&mqReduce.matches);}
function saveData(){try{var c=navigator.connection;return !!(c&&(c.saveData||/(^|-)2g$/.test(c.effectiveType||'')));}catch(e){return false;}}
var lowEnd=false; /* 저사양 안전장치가 한 번 켜지면 새로고침 전까지 정지 컷 유지 */
function canPlay(){return !reduced()&&!saveData()&&!lowEnd;} /* 모바일도 재생(소리만 데스크톱) */
function now(){return soundOn&&ctx?((ctx.currentTime-origin)%LOOP+LOOP)%LOOP:((performance.now()/1000-pOrigin)%LOOP+LOOP)%LOOP;}
function tick(){if(!ctx)return;while(nextTime<ctx.currentTime+.12){schedStep(ctx,out,nextStep%STEPS,nextTime);nextStep++;nextTime=origin+nextStep*STEP;}}
function setSoundUi(on){bSound.textContent=on?'소리 끄기':'소리 켜기';}
function soundOff(){if(!soundOn)return;var tv=now();soundOn=false;clearInterval(timer);timer=null;if(ctx){try{var cr=ctx.close();if(cr&&cr['catch'])cr['catch'](function(){});}catch(e){}ctx=null;out=null;}pOrigin=performance.now()/1000-tv;setSoundUi(false);}
function ctxDo(m){if(ctx&&ctx.state!=='closed'){try{var r=ctx[m]();if(r&&r['catch'])r['catch'](function(){});}catch(e){}}}
function pauseNow(){if(paused)return;tFrozen=now();paused=true;ctxDo('suspend');}
function resumeNow(){if(!paused)return;paused=false;if(ctx&&ctx.state!=='closed')ctxDo('resume');else pOrigin=performance.now()/1000-tFrozen;}
function setPauseUi(on){bPause.textContent=on?'▶':'❚❚';bPause.setAttribute('aria-pressed',on?'true':'false');}
bSound.addEventListener('click',function(){
  if(soundOn){soundOff();return;}
  var AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
  var tv=paused?tFrozen:now();
  try{ctx=new AC();}catch(e){ctx=null;return;}
  out=master(ctx);
  var c0=ctx;ctx.resume().then(function(){if(ctx!==c0||c0.state==='closed')return;origin=ctx.currentTime-tv;nextStep=Math.ceil(tv/STEP);nextTime=origin+nextStep*STEP;soundOn=true;timer=setInterval(tick,25);tick();setSoundUi(true);if(paused)ctxDo('suspend');},function(){});
});
bPause.addEventListener('click',function(){
  if(!paused){userPaused=true;autoPaused=false;pauseNow();setPauseUi(true);}
  else{userPaused=false;autoPaused=false;resumeNow();setPauseUi(false);}
});
/* 띠가 화면 밖이거나 탭이 숨겨지면 자동 일시정지(소리 포함), 돌아오면 이어서 — 사용자가 직접 멈춘 경우는 그대로 */
function inView(){var r=host.getBoundingClientRect();return r.bottom>0&&r.top<(window.innerHeight||800)&&!document.hidden;}
function watch(){
  if(!started||!canPlay())return;
  var v=inView();
  if(!v&&!paused&&!userPaused){autoPaused=true;pauseNow();}
  else if(v&&paused&&autoPaused&&!userPaused){autoPaused=false;resumeNow();}
}
document.addEventListener('visibilitychange',watch);
window.addEventListener('scroll',watch,{passive:true});
setInterval(watch,500);

/* 크기 맞춤: ≥1024 는 폭 기준(1440 무대를 비율대로), 그 미만 정지 컷은 높이 기준으로 오른쪽 글만 보이게 */
function fit(){
  var w=host.clientWidth;
  layout();
  var wide=window.innerWidth>=1024,sc=w/1440;
  stage.style.transform=wide?'scale('+sc+')':'none';
  /* 라벨(MAGAZINE GREEN·번호)은 무대를 줄여도 화면에서 12px 아래로 내려가지 않게 역배율(디자인 세션 11-06). 모바일은 무대를 줄이지 않으므로 12px 그대로 */
  if(wide)eye.style.fontSize=(sc<1?12/sc:12).toFixed(2)+'px';
}
function applyMode(){
  fit();var ok=canPlay();
  bSound.hidden=!ok||!started||isMob();bPause.hidden=!ok||!started;
  host.setAttribute('data-pgh',ok?'play':'still');host.setAttribute('data-pgw',window.innerWidth>=1024?'wide':'narrow');
  if(isMob())soundOff(); /* 1024 미만에서는 소리 없음 */
  if(!ok){soundOff();render(STILL_T);}
}
/* 저사양 안전장치(대표 승인 범위 「성능 기준 초과 시 끔」 소규모, 총괄 11-03): 재생 중 느린 프레임(50ms 초과)이 5초 안에 8번 이상이면(CPU 약 4배 느린 PC 수준) 정지 컷으로 내리고 새로고침 전까지 유지한다.
   재생 시작·재개 뒤 2초는 측정하지 않고(사진·글꼴 디코딩), 일시정지·화면 밖·숨김 탭은 측정하지 않으며, 1초 넘는 간격(탭 스로틀)은 무시한다. 소리도 함께 꺼지고 버튼은 숨겨진다. */
var lastF=0,warmUntil=0,slowF=[];
function guard(t){
  if(!lastF){lastF=t;warmUntil=t+2000;slowF.length=0;return;}
  var dt=t-lastF;lastF=t;
  if(t<warmUntil||dt>1000)return;
  if(dt>50)slowF.push(t);
  while(slowF.length&&t-slowF[0]>5000)slowF.shift();
  if(slowF.length>=8){lowEnd=true;slowF.length=0;host.setAttribute('data-pgh-low','1');applyMode();}
}
var fcnt=0;
function frame(t){
  /* 모바일은 그림을 초당 30번만 갱신한다(배터리·발열) — 시간 기준이라 박자가 어긋나지 않고, 저사양 측정(guard)은 매 프레임 그대로 */
  if(started&&!paused&&canPlay()){if(!MOB||((fcnt++)&1)===0)render(now());guard(t||performance.now());}else lastF=0;
  requestAnimationFrame(frame);
}

/* 사진·글꼴 준비 */
function loadPhotos(){
  var n=0,done=false,res;
  var pr=new Promise(function(r){res=r;});
  function fin(){if(!done){done=true;res();}}
  PHOTO_FILES.forEach(function(f,i){
    var im=new Image();
    im.onload=im.onerror=function(){n++;if(n>=2||n>=PHOTO_FILES.length)fin();}; /* 앞 두 장이 오면 시작, 나머지는 따라서 도착 */
    im.src=photoUrl(f);
  });
  PHOTO_FILES.forEach(function(f,i){photoSet[i]=1;});setPhotoUrls();
  setTimeout(fin,5000);
  return pr;
}
function loadFont(){
  return new Promise(function(res){
    var done=false;function fin(ok){if(done)return;done=true;fontsOk=!!ok;res();}
    try{
      var l=document.createElement('link');l.rel='stylesheet';l.href=FONT_CSS;l.onerror=function(){fin(false);};document.head.appendChild(l);
      if(document.fonts&&document.fonts.load){document.fonts.load('800 96px "Pretendard Variable"','식물도감이름으로사진찾고꽃색상햇빛유형고르알면정원보인다').then(function(){fin(true);},function(){fin(false);});}
      else fin(false);
    }catch(e){fin(false);}
    setTimeout(function(){fin(false);},3500);
  });
}
/* ── 등장: 보이게 될 때 서서히(한 번만) + 그때 재생 시작 ── */
var FADE=!reduced()&&!!window.IntersectionObserver,revealed=false,showReady=false,playPending=false,ioObj=null;
if(FADE){try{host.setAttribute('data-pgh-fade','wait');}catch(e){FADE=false;}}
function seen(){var r=host.getBoundingClientRect(),vh=window.innerHeight||800,vis=Math.min(vh,r.bottom)-Math.max(0,r.top);return !document.hidden&&r.height>0&&vis>=r.height*.28;}
function reveal(){
  if(revealed||!showReady)return;
  if(FADE&&!seen())return;
  revealed=true;if(ioObj){try{ioObj.disconnect();}catch(e){}ioObj=null;}
  if(playPending){playPending=false;started=true;pOrigin=performance.now()/1000;applyMode();render(0);}
  if(FADE){requestAnimationFrame(function(){requestAnimationFrame(function(){host.setAttribute('data-pgh-fade','in');});});setTimeout(function(){host.removeAttribute('data-pgh-fade');},1000);}
}
if(FADE){try{ioObj=new IntersectionObserver(function(es){for(var i=0;i<es.length;i++)if(es[i].isIntersecting){reveal();break;}},{threshold:.28});ioObj.observe(host);}catch(e){ioObj=null;}}
document.addEventListener('visibilitychange',reveal);window.addEventListener('scroll',reveal,{passive:true});setInterval(reveal,500); /* IO 가 못 알려도(백그라운드 등) 곧 보이게 하는 안전망 */
function boot(){
  fit();
  if(!canPlay()){ /* 정지 컷: 가변 글꼴 없이 사이트 기본 글꼴로 한 장 — 넓은 화면(≥1024, 움직임 줄이기·Save-Data)이면 정원 전경 사진 한 장만, 좁은 화면은 글만(사진 칸 숨김) */
    if(!saveData()){photoSet[4]=1;setPhotoUrls();} /* Save-Data·2G 가 아니면 정원 전경 한 장(모바일은 작은 판) */
    else if(isMob())host.setAttribute('data-pgh-nophoto','1'); /* 사진을 받지 않는 경우 사진 칸은 회색 빈칸 대신 브랜드 초록 띠 */
    applyMode();
    if(document.fonts&&document.fonts.ready)document.fonts.ready.then(function(){fit();render(STILL_T);});
    showReady=true;reveal();
    return;
  }
  Promise.all([loadPhotos(),loadFont()]).then(function(){
    if(!canPlay()){applyMode();showReady=true;reveal();return;}
    playPending=true;showReady=true;render(0);reveal(); /* 재생 시작은 보이게 될 때(reveal) */
  });
}
window.addEventListener('resize',function(){
  var was=started;
  if(!was&&canPlay()&&!playPending){boot();return;} /* 정지 컷 → 재생 가능 폭으로 커짐: 처음부터 준비 */
  applyMode();
});
requestAnimationFrame(frame);
boot();
window.__pgHeroApi={render:render,applyMode:applyMode,state:function(){return {revealed:revealed,fade:host.getAttribute('data-pgh-fade'),started:started,paused:paused,soundOn:soundOn,mode:host.getAttribute('data-pgh'),fontsOk:fontsOk};}};
})();
