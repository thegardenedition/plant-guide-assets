
(function(){
var PB='https://apis.data.go.kr/1400119/PlantResource';
var KEY='57a313760f23320ea0e2f7b63e2a1ce80450c86a7470a67067e03a8037ff513e'; /* 공공데이터포털 일반 인증키(Decoding) */
var pQ='',pST=null,pAll=[],pShown=0;
/* 상세창 사진을 fast/all 두 단계로 나눠 렌더링하면서 생기는 경쟁 상태 방지용
   토큰 - 상세창을 열자마자 다른 식물을 다시 클릭하면, 먼저 연 상세창의 느린
   단계(all) 응답이 나중에 도착해 지금 보고 있는 다른 식물의 슬라이드를
   덮어쓸 수 있다. pDetail이 호출될 때마다 값을 올리고, 각 렌더링 콜백은 자기
   토큰이 최신일 때만 실제로 화면을 갱신한다. */
var pDetailToken=0;
var PAGE_SIZE=20;

/* ---- 상세창 공통 디자인 토큰 ----
   "줄간격·행간·이모지·아이콘·박스 디자인이 제각각이라 보기 불편하다"는
   지적에 따라, 상세창 안의 모든 서술형 섹션(학술정보/농사로/발간도서·
   숲이야기 등)이 같은 여백·줄간격·구분선·라벨 스타일을 쓰도록 공용
   헬퍼로 통일한다. 사이트 자체 스타일 가이드(Inter 폰트, neutral 팔레트,
   radius 0의 각진 flat 디자인, --neutral-300 #E6E6E6 구분선)를 그대로
   따르며, 섹션마다 24/24·24/8처럼 제각각이던 여백을 32px 한 값으로
   맞추고, 본문 줄간격도 1.6~1.9로 흩어져 있던 것을 1.75~1.8 두 값으로
   좁혔다. */
var UI_ROW_LABEL='padding:16px 0;color:#ABABAB;width:30%;font-size:12px;letter-spacing:.2px;vertical-align:top;font-weight:500';
var UI_ROW_VALUE='padding:16px 0;color:#121212;font-size:14px;line-height:1.75';
function uiRows(rows){
  if(!rows||!rows.length)return'';
  return '<table style="width:100%;border-collapse:collapse">'+rows.map(function(r){
    return '<tr style="border-bottom:1px solid #E6E6E6"><td style="'+UI_ROW_LABEL+'">'+esc(r[0])+'</td><td style="'+UI_ROW_VALUE+'">'+esc(r[1])+'</td></tr>';
  }).join('')+'</table>';
}
function uiSection(title,inner){
  if(!inner)return'';
  return '<div style="border-top:1px solid #E6E6E6;padding-top:32px;margin-top:32px">'
    +(title?'<p style="font-size:12px;font-weight:600;letter-spacing:1px;color:#121212;margin:0 0 16px">'+esc(title)+'</p>':'')
    +inner+'</div>';
}
function uiBody(text){return text?'<p style="color:#121212;font-size:14px;line-height:1.8;margin:0 0 16px;white-space:pre-line">'+esc(text)+'</p>':'';}
function uiLabeledText(label,text){return text?'<p style="color:#121212;font-size:14px;line-height:1.8;margin:0 0 14px"><b style="font-weight:600">'+esc(label)+'</b> — '+esc(text)+'</p>':'';}
function uiEmpty(msg){return '<p style="color:#ABABAB;text-align:center;padding:28px 0;font-size:13px;line-height:1.7">'+esc(msg||'정보가 없습니다.')+'</p>';}
function uiTag(t){return '<span style="display:inline-block;border:1px solid #E6E6E6;padding:4px 10px;font-size:11px;color:#787878;margin:0 6px 6px 0;letter-spacing:.2px">#'+esc(t)+'</span>';}
/* 사진이 없을 때 쓰던 나무 이모지(🌳)를 "이모지 대신 절제된 아이콘" 요청에
   따라 중립색(#D6D6D6) 선 아이콘(간단한 사진 자리표시 기호)으로 바꾼다 -
   배경색과 무관하게 어디서나 같은 톤으로 보인다. */
var PLACEHOLDER_ICON='<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#D6D6D6" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="1"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5-9 9"/></svg>';

/* ---- 농사로(농촌진흥청) 오픈API 7종 ----
   data.go.kr과 별개로 nongsaro.go.kr 자체에서 발급하는 인증키를 쓰며, 파라미터
   이름도 'apiKey'로 data.go.kr('serviceKey')과 다르고 응답도 XML이다. 이 중
   학명이 있어 특정 식물 검색과 연결할 수 있는 세 서비스(실내정원용 식물/민간
   약초/잡초정보)는 종 수가 적어(실내정원 217종, 민간약초 178종, 잡초 661종)
   페이지 로드 시 한 번에 통째로 받아 학명 기준으로 인덱싱해둔다("정원 관련
   식물도 우선순위" 요구와도 맞물려, 이 인덱스에 있으면 정원용 식물로 우대된다).
   나머지 네 서비스(꽃장식과 정원 꾸미기/실내정원 만들기/실내정원 동영상강좌/
   좋아하는 꽃)는 특정 학명에 매이지 않는 콘텐츠라 검색 결과 카드에는 못
   붙이고, 상세창을 열 때 그 식물의 국명/색상과 실제로 관련된 항목만 걸러
   상세창 "정원 가이드" 탭에 이어붙인다(nongsaroGeneralHtml, pgc* 함수들 -
   페이지 하단의 별도 섹션이 아니라 각 식물 상세정보 안에 포함됨).
   ▶중요: api.nongsaro.go.kr는 브라우저에서의 직접 호출(CORS)을 지원하지 않아,
   Webflow 코드임베드(순수 클라이언트 JS)에서 바로 fetch()로 부를 수 없다(실제
   테스트로 확인됨 - GBIF/data.go.kr는 되는데 이 도메인만 "Failed to fetch").
   그래서 별도로 제공한 nongsaro-proxy-worker.js(Cloudflare Workers용, 무료)를
   중계 서버로 배포한 뒤 그 주소를 아래 NONGSARO_PROXY에 넣어야 이 기능이
   동작한다. 비워두면 이 기능은 조용히 건너뛰고 나머지 기능은 그대로 동작한다.
   ▶실제 배포된 프록시 주소(nongsaro-proxy-worker.js를 Cloudflare Workers에
   배포해 발급받음): */
var NONGSARO_PROXY='https://nongsaro-proxy.chgreena.workers.dev';
function fetchNongsaroItems(path,params){
  if(!NONGSARO_PROXY)return Promise.resolve([]);
  var qs=Object.keys(params||{}).map(function(k){return k+'='+encodeURIComponent(params[k]);}).join('&');
  var url=NONGSARO_PROXY.replace(/\/$/,'')+'/proxy/'+path+(qs?'?'+qs:'');
  return fetch(url).then(function(r){return r.ok?r.text():'';}).then(function(txt){
    if(!txt)return [];
    var xml=new DOMParser().parseFromString(txt,'text/xml');
    var rc=xml.querySelector('resultCode');
    if(!rc||rc.textContent.trim()!=='00')return [];
    return Array.from(xml.querySelectorAll('item')).map(function(it){
      var o={};
      Array.from(it.children).forEach(function(el){o[el.tagName]=el.textContent.trim();});
      return o;
    });
  }).catch(function(){return [];});
}
/* 산림청 "숲에 사는 식물 정보(산림문화·휴양정보)" - 승인된 개발계정으로
   새로 연동하는 소스. 식물명의 서식지·생애사·이야기 같은 서술형 콘텐츠를
   제공해 학술정보 탭을 보강한다. 단, apis.data.go.kr 게이트웨이를 거치지
   않는 산림청 자체 서버(api.forest.go.kr)라서, 같은 이유로 CORS가 막혀
   있던 api.nongsaro.go.kr 선례를 그대로 따를 가능성이 있다. 실제로 이
   엔드포인트를 브라우저로 직접 호출해 검증하려 했으나 연결 자체가 계속
   시간 초과되어(네트워크 문제인지 서버 문제인지 이 세션에서는 특정하지
   못함) CORS/HTTPS 지원 여부를 확인하지 못했다. 그래서 실패를 전제로 짠다:
   fetch가 막히거나 시간 초과되면 catch에서 조용히 null을 반환해 학술정보
   탭에 이 섹션만 빠지고 나머지 기능에는 전혀 영향이 없도록 한다("정확한
   데이터만 신뢰" 원칙과 동일하게, 확인 안 된 것을 사용자에게 보여주지
   않는다). 실제 배포(Webflow, https) 후 정상 응답이 오면 자동으로 보인다. */
/* api.forest.go.kr가 이 세션에서 계속 연결 시간 초과를 일으켰는데(주석 참고),
   일반 fetch()는 타임아웃이 없어서 브라우저의 기본 TCP 타임아웃(수십 초)까지
   그대로 기다린다. 이 호출이 정원 가이드/조경 스펙/학술정보 세 탭을 채우는
   Promise.all 안에 함께 묶여 있어서, 이 한 소스가 느리면 이미 다 준비된 다른
   두 소스(농사로, 발간도서 3종)까지 화면에 못 나오고 "정보 불러오는 중..."
   상태로 발이 묶인다("로딩이 너무 느려" 지적의 원인). AbortController로 3초
   타임아웃을 걸어 이 소스만 조용히 포기하고 나머지는 제때 뜨도록 한다. */
function fetchWithTimeout(url,ms){
  if(typeof AbortController==='undefined')return fetch(url);
  var ctrl=new AbortController();
  var timer=setTimeout(function(){ctrl.abort();},ms);
  return fetch(url,{signal:ctrl.signal}).then(function(r){clearTimeout(timer);return r;},function(e){clearTimeout(timer);throw e;});
}
/* 첫 호출이 실패/시간초과하면(=api.forest.go.kr가 이번 방문 세션 내내 응답을
   안 준다는 뜻일 가능성이 높음) 이후 상세창을 열 때마다 매번 3초씩 다시
   기다리지 않도록 회로차단기를 둔다. 한 번 성공하면 계속 정상 사용, 한 번
   실패하면 이 세션 동안은 즉시 건너뛴다(새로고침하면 다시 시도). */
var forestStoryBroken=false;
function fetchForestStory(nm){
  if(!nm||forestStoryBroken)return Promise.resolve(null);
  var url='https://api.forest.go.kr/openapi/service/cultureInfoService/fStoryOpenAPI?serviceKey='+encodeURIComponent(KEY)+'&searchWrd='+encodeURIComponent(nm)+'&numOfRows=1&pageNo=1';
  return fetchWithTimeout(url,2500).then(function(r){return r.ok?r.text():'';}).then(function(txt){
    if(!txt)return null;
    var xml=new DOMParser().parseFromString(txt,'text/xml');
    if(xml.querySelector('parsererror'))return null;
    var rc=xml.querySelector('resultCode');
    if(rc&&rc.textContent.trim()!=='0000')return null;
    var item=xml.querySelector('item');
    if(!item)return null;
    var o={};
    Array.from(item.children).forEach(function(el){o[el.tagName]=el.textContent.trim();});
    return o;
  }).catch(function(){forestStoryBroken=true;return null;});
}
function forestStoryHtml(nm){
  return fetchForestStory(nm).then(function(o){
    if(!o)return '';
    var story=(o.fsstory||o.fsguide||'').trim();
    var rows=[];
    pushRow(rows,'서식장소',o.fsinhabit);
    pushRow(rows,'식물의 일생',o.fslifetime);
    if(!rows.length&&!story)return '';
    return uiSection('숲이야기 · 산림청(산림문화·휴양정보)',uiBody(story)+uiRows(rows));
  }).catch(function(){return '';});
}
/* 민간약초 API의 학명 필드(bneNm)는 "Potentilla kleiniana (장미과)"처럼 끝에
   과명이 괄호로 덧붙어 있어, cleanSciName에 넣기 전에 그 부분부터 떼어낸다. */
function stripFamilySuffix(s){return (s||'').replace(/\s*[\(（].*?[\)）]\s*$/,'').trim();}
var NONGSARO_HERB={},NONGSARO_WEED={},NONGSARO_GARDEN_CANDIDATES=null;
function loadNongsaroHerb(){
  return fetchNongsaroItems('prvateTherpy/prvateTherpyList',{numOfRows:300,pageNo:1}).then(function(items){
    items.forEach(function(it){
      var key=cleanSciName(stripFamilySuffix(it.bneNm));
      if(key)NONGSARO_HERB[key.toLowerCase()]=it;
    });
  });
}
function loadNongsaroWeed(){
  return fetchNongsaroItems('weedsInfo/weedsInfoList',{numOfRows:1000,pageNo:1}).then(function(items){
    items.forEach(function(it){
      var key=cleanSciName(it.klangNm);
      if(key)NONGSARO_WEED[key.toLowerCase()]=it;
    });
  });
}
/* '실내정원용 식물'(gardenList)에는 국명(cntntsSj)만 있고 학명이 없다 - 학명은
   종 하나하나를 gardenDtl로 상세조회해야만 나온다. 217종 전부를 미리 상세조회
   하면 페이지 로드가 느려지므로, 국명 후보 목록만 먼저 받아두고 실제 검증
   (학명 완전 일치 확인)은 그 종의 상세창을 열 때만 한다(fetchGardenMatch). */
function loadNongsaroGardenList(){
  return fetchNongsaroItems('garden/gardenList',{numOfRows:300,pageNo:1}).then(function(items){
    NONGSARO_GARDEN_CANDIDATES=items;
  });
}
var nongsaroDataReady=Promise.all([loadNongsaroHerb(),loadNongsaroWeed(),loadNongsaroGardenList()])
  .catch(function(){/* 농사로 쪽이 실패해도(키 만료 등) 나머지 기능은 정상 동작해야 한다 */});

/* 농사로 오픈API 중 남은 4종(꽃장식과 정원 꾸미기/실내정원 만들기/실내정원
   동영상강좌/좋아하는 꽃)은 위 3종과 달리 특정 학명에 매이지 않는 콘텐츠다
   ("좋아하는 꽃"은 색상 7종 분류, 나머지는 제목 위주의 DIY/영상 목록이라 학명
   필드가 아예 없다 - 실측으로 필드 목록을 직접 확인함). 예전에는 이 때문에
   페이지 하단의 별도 섹션(#pgardencontent)에 통째로 나열했었는데, "하단에
   별도로 노출하지 말고 식물 상세정보에 포함시켜 달라"는 요청에 따라 방식을
   바꿨다: 페이지 로드 후 첫 상세창이 열릴 때 4종을 한 번만 통째로 받아
   캐시해두고(nongsaroGeneralReady), 그 상세창의 학명·국명에 실제로 관련된
   항목만 걸러내 정원 가이드 탭 안에 이어붙인다 - 관련 없는 항목은 아예
   보여주지 않는다("정확한 데이터만 신뢰" 원칙과 동일).
   - 꽃장식/실내정원 만들기/동영상강좌: 제목(cntntsSj)에 해당 식물의 국명이
     그대로 포함된 경우만 채택(부분 문자열 일치 - 과도하게 다른 식물을 끌어오는
     것을 막기 위해 느슨한 유사도 매칭은 쓰지 않는다).
   - 좋아하는 꽃: 학명/국명 필드가 없는 대신 색상 계열(colorInfo)로만 분류되어
     있어, 이 앱이 이미 상세정보에서 뽑아내는 꽃 색상(attrs.colors)과 같은
     계열이면 채택한다. */
var PREF_COLOR_MAP={'빨간색계열':'빨강','적색계열':'빨강','분홍색계열':'분홍','노란색계열':'노랑','주황색계열':'주황','흰색계열':'흰색','보라색계열':'보라','파란색계열':'파랑','녹색계열':'초록','검정색계열':'검정','검은색계열':'검정'};
var nongsaroGeneralReady=null;
function loadNongsaroGeneral(){
  if(nongsaroGeneralReady)return nongsaroGeneralReady;
  if(!NONGSARO_PROXY){nongsaroGeneralReady=Promise.resolve({decor:[],make:[],video:[],pref:[]});return nongsaroGeneralReady;}
  nongsaroGeneralReady=Promise.all([
    fetchNongsaroItems('flwrDecor/flwrDecorList',{numOfRows:100,pageNo:1}),
    fetchNongsaroItems('cateGardenMake/cateGardenMakeLst',{numOfRows:60,pageNo:1}),
    fetchNongsaroItems('indoorpsncpaMvpLctre/indoorpsncpaMvpLctreLst',{numOfRows:60,pageNo:1}),
    fetchNongsaroItems('preferenceFlower/preferenceFlowerList',{numOfRows:30,pageNo:1})
  ]).then(function(res){
    return {decor:res[0]||[],make:res[1]||[],video:res[2]||[],pref:res[3]||[]};
  }).catch(function(){return {decor:[],make:[],video:[],pref:[]};});
  return nongsaroGeneralReady;
}
function pgcCard(it,kind){
  var img=(it.imgUrl||it.imageFileUrl)?('<div style="width:100%;aspect-ratio:4/3;background:#F2F2F2;overflow:hidden;margin-bottom:6px"><img src="'+esc(it.imgUrl||it.imageFileUrl)+'" style="width:100%;height:100%;object-fit:cover" loading="lazy"></div>'):'';
  var label=kind==='pref'?[it.effectInfo,it.spceInfo].filter(Boolean).join(' · '):(it.cntntsSj||'');
  return '<div>'+img+'<p style="font-size:12px;color:#121212;margin:0;line-height:1.6">'+esc(label)+'</p></div>';
}
function pgcGroup(title,items,kind){
  if(!items.length)return'';
  return (title?'<p style="font-size:12px;font-weight:600;color:#787878;margin:0 0 10px">'+esc(title)+'</p>':'')
    +'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:18px">'
    +items.map(function(it){return pgcCard(it,kind);}).join('')+'</div>';
}
/* 상세창(정원 가이드 탭)에 이어붙일 조각을 만든다 - nm(국명)과 colors(꽃 색상
   배열)에 실제로 매칭되는 항목이 하나도 없으면 빈 문자열을 돌려주고, 그러면
   호출부에서 이 섹션 자체가 화면에 나타나지 않는다. */
function nongsaroGeneralHtml(nm,colors){
  return loadNongsaroGeneral().then(function(all){
    var nmClean=(nm||'').trim();
    var decorM=nmClean?all.decor.filter(function(it){return (it.cntntsSj||'').indexOf(nmClean)!==-1;}):[];
    var makeM=nmClean?all.make.filter(function(it){return (it.cntntsSj||'').indexOf(nmClean)!==-1;}):[];
    var videoM=nmClean?all.video.filter(function(it){return (it.cntntsSj||'').indexOf(nmClean)!==-1;}):[];
    var colorSet={};(colors||[]).forEach(function(c){colorSet[c]=1;});
    var prefM=all.pref.filter(function(it){var mapped=PREF_COLOR_MAP[it.colorInfo]||'';return mapped&&colorSet[mapped];});
    var body=pgcGroup('꽃장식과 정원 꾸미기',decorM.slice(0,3),'decor')
      +pgcGroup('실내정원 만들기',makeM.slice(0,3),'make')
      +pgcGroup('실내정원 동영상강좌',videoM.slice(0,2),'video')
      +pgcGroup('',prefM.slice(0,2),'pref');
    if(!body)return'';
    return uiSection('가드닝 콘텐츠 · 농사로(농촌진흥청)',body);
  }).catch(function(){return'';});
}
/* 국명 후보들을 학명으로 검증한 뒤에만 채택 - 학명이 다르면(동명이인 국명)
   버린다. GBIF 통합 때 세운 "학명이 다르면 삭제" 원칙을 여기도 동일 적용. */
function fetchGardenMatch(korNm,sciNm){
  var clean=cleanSciName(sciNm);
  if(!clean||!NONGSARO_GARDEN_CANDIDATES||!NONGSARO_GARDEN_CANDIDATES.length)return Promise.resolve(null);
  var cand=NONGSARO_GARDEN_CANDIDATES.filter(function(it){return it.cntntsSj===korNm;});
  if(!cand.length)return Promise.resolve(null);
  return Promise.all(cand.map(function(c){
    return fetchNongsaroItems('garden/gardenDtl',{cntntsNo:c.cntntsNo}).then(function(items){
      var d=items[0];
      if(!d||!d.plntbneNm)return null;
      if(cleanSciName(d.plntbneNm).toLowerCase()!==clean.toLowerCase())return null;
      d._list=c;
      return d;
    });
  })).then(function(results){return results.filter(Boolean)[0]||null;});
}
function nongsaroGardenPhotos(d){
  if(!d||!d._list||!d._list.rtnFileUrl)return [];
  return d._list.rtnFileUrl.split('|').map(function(s){return s.trim();}).filter(Boolean).slice(0,6)
    .map(function(u){return {url:u,credit:'사진 · 농사로(농촌진흥청) 실내정원용 식물'};});
}
function nongsaroHerbWeedPhotos(sciNm){
  var clean=cleanSciName(sciNm).toLowerCase(),out=[];
  var h=NONGSARO_HERB[clean];
  if(h){for(var i=1;i<=6;i++){var u=h['imgUrl'+i];if(u)out.push({url:u,credit:'사진 · 농사로 민간약초정보'});}}
  var w=NONGSARO_WEED[clean];
  if(w&&w.imgUrl)out.push({url:w.imgUrl,credit:'사진 · 농사로 잡초정보'});
  return out;
}
/* 상세창이 역할별 탭(정원 가이드/조경 스펙/학술정보)으로 나뉘면서, 농사로
   데이터도 한 덩어리로 붙이지 않고 성격에 맞춰 흩어 넣는다 - 배치장소/광도/
   관리난이도/향/독성처럼 "돌보는 사람"이 필요한 정보는 가드너 탭(garden)에,
   유통명/영명/용도/생장스펙처럼 "설계하는 사람"이 필요한 정보는 조경 탭
   (landscape)에, 민간약초·잡초처럼 자원으로서의 성격이 강한 정보는 학술
   탭(academic)에 넣는다. 세 탭이 공유하는 학명 기준 조회이므로 한 번만
   호출하고 세 개의 html 조각을 함께 돌려준다. */
function nongsaroSection(title,rows){
  if(!rows.length)return'';
  return uiSection(title,uiRows(rows));
}
function nongsaroPanelData(korNm,sciNm){
  return nongsaroDataReady.then(function(){
    var clean=cleanSciName(sciNm).toLowerCase();
    var herb=NONGSARO_HERB[clean],weed=NONGSARO_WEED[clean];
    return fetchGardenMatch(korNm,sciNm).then(function(garden){
      var gardenRows=[],landscapeRows=[],academicRows=[];
      if(garden){
        pushRow(gardenRows,'배치 장소',garden.postngplaceCodeNm);
        pushRow(gardenRows,'광도 요구',garden.lighttdemanddoCodeNm);
        pushRow(gardenRows,'관리 난이도',garden.managelevelCodeNm);
        pushRow(gardenRows,'향',garden.smellCodeNm);
        pushRow(gardenRows,'독성',garden.toxctyInfo);
        pushRow(gardenRows,'병충해 관리',garden.dlthtsManageInfo);
        pushRow(landscapeRows,'추천 유통명',garden.distbNm);
        pushRow(landscapeRows,'영명',garden.plntzrNm);
        pushRow(landscapeRows,'용도',garden.adviseInfo);
        pushRow(landscapeRows,'생장 높이',garden.growthHgInfo);
        pushRow(landscapeRows,'생육 면적',garden.growthAraInfo);
        pushRow(landscapeRows,'생장 속도',garden.grwtveCodeNm);
        pushRow(landscapeRows,'실내 배치 구성',garden.indoorpsncpacompositionCodeNm);
        pushRow(landscapeRows,'원산지',garden.orgplceInfo);
        pushRow(landscapeRows,'특징',garden.fncltyInfo);
      }
      if(herb){
        pushRow(academicRows,'한약명',herb.hbdcNm);
        pushRow(academicRows,'이용 부위',herb.useeRegn);
        pushRow(academicRows,'형태',herb.stle);
        pushRow(academicRows,'민간요법',(herb.prvateTherpy||'').replace(/<br\s*\/?>/g,' '));
      }
      if(weed){
        pushRow(academicRows,'잡초 분류(과)',weed.weedsFmlNm);
      }
      return {
        gardenHtml:nongsaroSection('실내정원 관리 정보 · 농사로(농촌진흥청)',gardenRows),
        landscapeHtml:nongsaroSection('실내정원 조경 스펙 · 농사로(농촌진흥청)',landscapeRows),
        academicHtml:nongsaroSection('민간약초·잡초 자원정보 · 농사로(농촌진흥청)',academicRows)
      };
    });
  }).catch(function(){return {gardenHtml:'',landscapeHtml:'',academicHtml:''};});
}

function esc(s){return (s==null?'':String(s)).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}

function pSpin(on){
  var a=0,el=document.getElementById('pspin');
  if(pST)clearInterval(pST);
  if(on)pST=setInterval(function(){a+=8;el.style.transform='rotate('+a+'deg)';},30);
  else el.style.transform='';
}

function hideAll(){['pinit','pld','perr','pemp','pcnt','pgrid','pmorewrap'].forEach(function(id){document.getElementById(id).style.display='none';});}
function showLoading(){hideAll();document.getElementById('pld').style.display='block';pSpin(true);}
function hideLoading(){pSpin(false);document.getElementById('pld').style.display='none';}
function showError(msg){hideLoading();hideAll();document.getElementById('perrmsg').textContent=msg;document.getElementById('perr').style.display='block';}

/* XML 대신 JSON으로 통신 (data.go.kr 표준 파라미터 _type=json 사용; returnType=json은
   이 API에서 작동하지 않음을 실측으로 확인함). JSON 파싱이 DOMParser보다 가볍고 코드도 간결해짐. */
function fetchJson(url,ms){
  return new Promise(function(resolve,reject){
    var c=new AbortController();
    var t=setTimeout(function(){c.abort();reject(new Error('시간 초과'));},ms||15000);
    fetch(url,{signal:c.signal}).then(function(r){
      clearTimeout(t);
      if(!r.ok){reject(new Error('HTTP '+r.status));return null;}
      return r.json();
    }).then(function(data){
      if(data==null)return;
      resolve(data);
    }).catch(function(e){clearTimeout(t);reject(e);});
  });
}
/* ---- 로딩 최소화: localStorage 캐시 ----
   실측 결과 검색 로딩이 느린 가장 큰 원인은 정부 API 자체의 서버 지연(건당
   1~5초, 클라이언트 코드로는 줄일 수 없음)이었다. 이건 "매번 새로 물어보지
   않아도 되는 요청을 아예 안 하는 것"으로만 줄일 수 있다 - 도감/표본 데이터는
   자주 바뀌지 않으므로, 한 번 받은 응답을 localStorage에 저장해두고 같은
   검색어·같은 종 상세를 다시 열 때는 네트워크 왕복 없이 즉시 보여준다. */
var CACHE_PREFIX='pg_c_';
function cacheGet(key,ttlMs){
  try{
    var raw=localStorage.getItem(CACHE_PREFIX+key);
    if(!raw)return undefined;
    var obj=JSON.parse(raw);
    if(!obj||typeof obj.t!=='number'||Date.now()-obj.t>ttlMs)return undefined;
    return obj.v;
  }catch(e){return undefined;}
}
function cacheSet(key,val){
  try{localStorage.setItem(CACHE_PREFIX+key,JSON.stringify({t:Date.now(),v:val}));}catch(e){/* 저장 공간 초과 등은 무시하고 계속 진행 */}
}
var SEARCH_CACHE_TTL=1000*60*60*12; /* 검색 목록: 12시간 - 신종 등재 반영을 위해 하루 이내로 제한 */
var DETAIL_CACHE_TTL=1000*60*60*24*7; /* 종 상세정보: 7일 - 형태/분포 설명은 사실상 바뀌지 않음 */

/* 필드 값을 안전하게 문자열로 꺼낸다 (숫자/undefined/null 방어) */
function val(o,k){var v=o&&o[k];return (v==null)?'':String(v);}
/* items가 없음("")/단일 객체/배열 세 가지 형태로 오는 data.go.kr 특유의 응답을 배열로 정규화 */
function normalizeItems(items){
  if(!items||items==='')return[];
  if(Array.isArray(items.item))return items.item;
  if(items.item)return[items.item];
  return[];
}

/* 학명 문자열에서 명명자(저자 인용)를 잘라내고 속명+종소명(+변종/아종)만 남긴다.
   예: "Rosa multiflora Thunb. var. platyphylla Thory" -> "Rosa multiflora" */
function cleanSciName(sc){
  if(!sc)return'';
  var toks=sc.trim().split(/\s+/),out=[];
  for(var i=0;i<toks.length;i++){
    var t=toks[i];
    if(i===0){out.push(t);continue;}
    if(/^[a-z][a-z-]*$/.test(t)||/^(var\.|subsp\.|f\.)$/.test(t)){out.push(t);continue;}
    break;
  }
  return out.join(' ');
}
/* ---- 정적 정밀 데이터셋(국가표준식물목록 CSV 가공본) ----
   국립수목원 학명 마스터(3.6만종, 목본/초본/과명 등 분류)와 상세설명(5,400여종,
   잎/꽃/열매/줄기별로 분리된 서술)을 학명 기준으로 미리 가공해둔 JSON 두 개를
   불러온다. GitHub(thegardenedition/plant-guide-assets)에 업로드해 jsDelivr
   CDN으로 서빙하며, 로드에 실패해도 사이트 나머지 기능은 기존 방식(실시간
   API + 정규식 추출)대로 정상 동작한다. */
var STATIC_NAME_URL='https://raw.githubusercontent.com/thegardenedition/plant-guide-assets/main/plant_name_master.json';
var STATIC_SPECIES_URL='https://raw.githubusercontent.com/thegardenedition/plant-guide-assets/main/plant_species_detail.json';
var STATIC_NAME={},STATIC_SPECIES={};
function loadStaticTable(url,dest){
  if(!url)return Promise.resolve();
  return fetch(url).then(function(r){return r.ok?r.json():null;}).then(function(t){
    if(!t||!t.fields||!t.rows)return;
    var fields=t.fields,keys=t.keys||[];
    t.rows.forEach(function(row,i){
      var rec={};
      fields.forEach(function(f,fi){if(row[fi])rec[f]=row[fi];});
      dest[keys[i]||cleanSciName(rec.sc)]=rec;
    });
  }).catch(function(){/* 정적 데이터는 있으면 좋은 보강재료일 뿐, 실패해도 무시 */});
}
var staticDataReady=Promise.all([
  loadStaticTable(STATIC_NAME_URL,STATIC_NAME),
  loadStaticTable(STATIC_SPECIES_URL,STATIC_SPECIES)
]);
function getStaticMatch(sciNm){
  var key=cleanSciName(sciNm);
  if(!key)return null;
  var sp=STATIC_SPECIES[key],nm=STATIC_NAME[key];
  if(!sp&&!nm)return null;
  return {species:sp||null,name:nm||null};
}

/* ---- 국립수목원 발간 도서 5종(사용자 제공 PDF) ----
   「우리 꽃으로 만드는 정원 식물도감」「형태로/질감으로/색으로 찾는 우리꽃
   정원식물」「숲정원을 위한 식물 300종」에서 종별 설명을 추출해 학명 기준으로
   미리 가공해둔 정적 JSON 세 개(위 STATIC_NAME/SPECIES와 동일한 {fields,keys,
   rows} 표 형식이라 loadStaticTable을 그대로 재사용)를 불러온다. 총 데이터가
   500KB 이상이라 파일에 직접 박아 넣지 않고(로딩 지연 유발), 이미 이 파일이
   쓰고 있는 "정적 데이터셋은 외부 JSON으로 호스팅 후 URL만 채워 넣는다"는
   원칙을 그대로 따른다 - URL이 비어있으면 이 섹션만 조용히 빠지고 나머지
   기능에는 영향이 없다.
   GitHub(thegardenedition/plant-guide-assets)에 업로드해 raw.githubusercontent.com로
   서빙한다(정적 데이터셋과 동일한 방식 - fetch()로 받는 JSON이라 raw 도메인의
   MIME 타입 제약을 받지 않는다).
   - 형태·질감·색으로 찾는 우리꽃 정원식물(3권, 총 450종) → 학술정보 탭
     (자생환경·국명유래·학명유래 등 분류학적 서술 중심), 국명/학명 유래가
     있는 종은 "스토리" 필터(pFilter.story)에도 매치된다(bookHasStory 참고).
   - 우리꽃으로 만드는 정원식물도감(텃밭·약초·실내·빗물·옥상·학교정원, 108종)
     → 정원 가이드 탭(자생지·식재·관리·증식 등 실제 재배 정보 중심)
   - 숲정원을 위한 식물 300종(248종) → 조경 스펙 탭(토성·광조건·내한성 표와
     재배품종 서술 중심) */
var BOOK_FTC_URL='https://raw.githubusercontent.com/thegardenedition/plant-guide-assets/main/book_form_texture_color.json';
var BOOK_GARDEN_URL='https://raw.githubusercontent.com/thegardenedition/plant-guide-assets/main/book_garden_encyclopedia.json';
var BOOK_FOREST300_URL='https://raw.githubusercontent.com/thegardenedition/plant-guide-assets/main/book_forest_garden_300.json';
var BOOK_FTC={},BOOK_GARDEN={},BOOK_FOREST300={};
var bookDataReady=Promise.all([
  loadStaticTable(BOOK_FTC_URL,BOOK_FTC),
  loadStaticTable(BOOK_GARDEN_URL,BOOK_GARDEN),
  loadStaticTable(BOOK_FOREST300_URL,BOOK_FOREST300)
]);
/* 정원정보 칩/필터(deriveCuratedProfile)는 국가표준식물목록 정적 데이터뿐 아니라
   도서 데이터(특히 스토리 유무 판정용 BOOK_FTC)도 함께 봐야 하므로, 두 로딩을
   합친 공용 준비 신호를 둔다 - staticDataReady만 기다리던 기존 호출부들은
   BOOK_FTC가 아직 비어있는 상태에서 hasStory를 항상 false로 오판할 수 있었다. */
var curationDataReady=Promise.all([staticDataReady,bookDataReady]);
var BOOK_AXIS_LABEL={form:'형태',texture:'질감',color:'색'};
function bookFtcHtml(r){
  var rows=[];
  pushRow(rows,'분류',r.axis&&r.category?(BOOK_AXIS_LABEL[r.axis]||'')+' · '+r.category:r.category);
  pushRow(rows,'IUCN 등급',r.iucn);
  pushRow(rows,'특산식물',r.endemic==='1'||r.endemic===1?'예':'');
  pushRow(rows,'생활형',r.life);
  pushRow(rows,'자생 환경',r.habitat);
  pushRow(rows,'꽃',r.bloom);
  pushRow(rows,'높이',r.height);
  pushRow(rows,'광조건',r.light);
  pushRow(rows,'토질',r.soil);
  pushRow(rows,'번식',r.propagate);
  return nongsaroSection('국립수목원 발간자료 · 형태·질감·색으로 찾는 우리꽃 정원식물',rows);
}
/* "단순한 정보 열람이 아니라 식물의 의미·이야기를 보여달라"는 요청에 따라
   이름의 유래(왜 이런 국명/학명이 붙었는지)를 학술정보 탭의 딱딱한 표에서
   분리해, 산림청 숲이야기와 함께 별도의 "이야기" 탭에 서술형으로 보여준다. */
function bookFtcStoryHtml(r){
  if(!r||(!r.originKor&&!r.originSci))return '';
  return uiSection('이름의 유래 · 국립수목원 발간자료',uiLabeledText('국명',r.originKor)+uiLabeledText('학명',r.originSci));
}
/* '스토리' 필터(정원 정보로 찾기 패널)가 쓰는 판정 함수 - 이름의 유래(국명·
   학명 유래) 서술이 있는 종만 "스토리 있음"으로 인정한다. 산림청 숲이야기는
   종별로 매번 네트워크 조회가 필요해(forestStoryHtml) 3.6만종 전체를 대상으로
   즉시 필터링할 수 없으므로, 필터 판정에는 클라이언트에 이미 통째로 로드되어
   있는 도서 데이터(BOOK_FTC)만 쓴다. */
function bookHasStory(sc){
  var key=cleanSciName(sc);
  if(!key)return false;
  var r=BOOK_FTC[key];
  return !!(r&&(r.originKor||r.originSci));
}
function bookGardenHtml(r){
  var rows=[];
  pushRow(rows,'테마정원',r.theme);
  pushRow(rows,'생활형',r.life);
  pushRow(rows,'높이',r.height);
  pushRow(rows,'개화기',r.bloom);
  pushRow(rows,'특산식물',r.endemic==='1'||r.endemic===1?'예':'');
  pushRow(rows,'생약명',r.herbName);
  pushRow(rows,'효능',r.herbEffect);
  pushRow(rows,'이용',r.use);
  pushRow(rows,'자생지',r.habitat);
  pushRow(rows,'식재 환경',r.planting);
  pushRow(rows,'관리',r.care);
  pushRow(rows,'증식',r.propagate);
  pushRow(rows,'비고',r.note);
  return nongsaroSection('국립수목원 발간자료 · 우리꽃으로 만드는 정원식물도감',rows);
}
function bookForest300Html(r){
  var rows=[];
  pushRow(rows,'자생 여부',r.native);
  pushRow(rows,'예상 높이',r.heightM?r.heightM+'m':'');
  pushRow(rows,'광환경',r.light);
  pushRow(rows,'토성',r.soilTexture);
  pushRow(rows,'토양 배수',r.soilDrain);
  pushRow(rows,'토양 수분',r.soilMoist);
  pushRow(rows,'내한성(USDA)',r.hardyZone);
  var adapt=[r.adaptEdge?'임연부':'',r.adaptInterior?'임내부':''].filter(Boolean).join(', ');
  pushRow(rows,'환경 적응성',adapt);
  pushRow(rows,'화색·개화기',[r.flowerColor,r.bloomTime].filter(Boolean).join(' · '));
  pushRow(rows,'열매색·결실기',[r.fruitColor,r.fruitTime].filter(Boolean).join(' · '));
  var prop=[r.propSeed?'실생':'',r.propCutting?'삽목':'',r.propDivide?'분주':''].filter(Boolean).join(', ');
  pushRow(rows,'번식법',prop);
  return uiSection('국립수목원 발간자료 · 숲정원을 위한 식물 300종',uiBody(r.desc)+uiRows(rows));
}
/* 세 도서 데이터를 학명 기준으로 한 번에 조회해 개요 탭의 슬롯들(정원가이드/
   조경/학술/이야기)에 나눠 붙인다 - pdFillOverviewExtras 안에서 sc만 받아
   호출하므로 기존 호출부를 전혀 손대지 않고도 모든 상세창에 자동으로
   반영된다. */
function bookProfileData(sc){
  var empty={gardenHtml:'',landscapeHtml:'',academicHtml:'',storyHtml:''};
  return bookDataReady.then(function(){
    var key=cleanSciName(sc);
    if(!key)return empty;
    var ftc=BOOK_FTC[key],garden=BOOK_GARDEN[key],f300=BOOK_FOREST300[key];
    return {
      gardenHtml:garden?bookGardenHtml(garden):'',
      landscapeHtml:f300?bookForest300Html(f300):'',
      academicHtml:ftc?bookFtcHtml(ftc):'',
      storyHtml:ftc?bookFtcStoryHtml(ftc):''
    };
  }).catch(function(){return empty;});
}

var pImgCache={};
/* ---- 국립수목원 표준식물목록이미지정보서비스 (data.go.kr 15116414) ----
   "학명이 같아도 사진 속 수종이 다르다"는 지적에 대해 가장 근본적인 해결책 -
   국립수목원이 표준식물목록 자체에 등록해 둔, 학명별 공식 이미지다(제공기관
   국립수목원, 이용허락범위 제한 없음, 무료). 지금까지 쓰던 GBIF·iNaturalist는
   전 세계 시민과학 기록이라 학명이 같아도 실제로는 지역변이·오동정 위험이
   있었는데, 이 자료는 국립수목원이 자신의 표준식물목록 학명에 직접 매칭해둔
   것이라 가장 신뢰도가 높다 - 그래서 농사로보다도 앞선 최우선 사진 소스로
   둔다. 4,763건 전체를 학명 기준 사전으로 한 번만 받아 메모리에 인덱싱한다
   (odcloud.kr는 이미 신청·승인된 계정의 일반 인증키를 그대로 재사용).
   ▶주의할 점 두 가지:
   1) 이미지종류가 "표본"(압착 표본 사진)인 행은 GBIF 표본관 사진과 같은
      이유로 제외하고 "사진"(생체 사진)만 채택한다.
   2) 원예 재배종(품종) 사진 자체는 제외할 이유가 없다 - 국립수목원이 직접
      찍은 정상적인 자료고, 이 앱은 가드너용 정보도 함께 다룬다(원예종 사진은
      오히려 실제 조경·원예에 더 요긴하다). 다만 학명에 작은따옴표로 묶인
      품종명(예: "Spiraea thunbergii 'Mount Fuji'")은 cleanSciName이 떼어내며
      원종과 같은 키로 묶이므로, "이 사진은 특정 품종입니다"를 출처 표기에
      그대로 남겨 사용자가 오해하지 않게 한다. 같은 종에 원종 사진과 품종
      사진이 둘 다 있으면 원종 사진을 먼저 배치해 대표 사진으로 우선 쓰이게
      한다. */
var NATURE_IMG={};
function loadNatureImageIndex(){
  var url='https://api.odcloud.kr/api/15116414/v1/uddi:b63f89a7-c57b-43c6-8868-f68d44ce17e5?page=1&perPage=5000&serviceKey='+encodeURIComponent(KEY);
  return fetch(url).then(function(r){return r.ok?r.json():null;}).then(function(j){
    var rows=(j&&Array.isArray(j.data))?j.data:[];
    var seen={};
    rows.forEach(function(row){
      var sc=row['학명'],path=row['이미지파일경로'],kind=row['이미지종류'];
      if(kind!=='사진'||!sc||!path)return;
      var key=cleanSciName(sc).toLowerCase();
      if(!key)return;
      var httpsUrl=path.replace(/^http:\/\//,'https://');
      if(seen[httpsUrl])return;
      seen[httpsUrl]=true;
      var cvMatch=sc.match(/'([^']+)'/);
      var entry={url:httpsUrl,credit:'사진 · 국립수목원 표준식물목록'+(cvMatch?(" ('"+cvMatch[1]+"' 품종)"):'')};
      if(!NATURE_IMG[key])NATURE_IMG[key]=[];
      if(cvMatch)NATURE_IMG[key].push(entry);else NATURE_IMG[key].unshift(entry); /* 원종 사진을 대표 사진으로 우선 배치 */
    });
  }).catch(function(){/* 실패해도 나머지 사진 소스로 정상 동작 */});
}
var natureImgReady=loadNatureImageIndex();
function fetchNatureImagePhotos(sciNm){
  var clean=cleanSciName(sciNm).toLowerCase();
  return natureImgReady.then(function(){return (NATURE_IMG[clean]||[]).slice();});
}
function fetchNatureImagePhoto(sciNm){
  return fetchNatureImagePhotos(sciNm).then(function(list){return list[0]||null;});
}
/* iNaturalist 학명 매칭: 정확히 일치(대소문자 무시)하는 '식물계' 항목이고,
   라이선스가 명시된(CC 계열) 사진만 신뢰할 수 있는 것으로 채택한다.
   그래야 다른 계(동물·곤충·균류 등)로 잘못 매칭되거나 저작권 미표시 사진이
   쓰이는 것을 막을 수 있다 ("신뢰도와 일치도"가 있는 이미지만 사용). */
function fetchINatPhoto(sciNm){
  var clean=cleanSciName(sciNm);
  if(!clean)return Promise.resolve(null);
  var url='https://api.inaturalist.org/v1/taxa?q='+encodeURIComponent(clean)+'&per_page=1';
  return fetch(url).then(function(r){return r.ok?r.json():null;}).then(function(j){
    var t=j&&j.results&&j.results[0];
    if(!t)return null;
    if(t.iconic_taxon_name!=='Plantae')return null;
    if(String(t.name).toLowerCase()!==clean.toLowerCase())return null;
    var p=t.default_photo;
    if(!p||!p.license_code)return null;
    return {url:p.medium_url||p.url,credit:(p.attribution_name?p.attribution_name+', ':'')+'CC '+p.license_code.replace('cc-','').toUpperCase()+' (iNaturalist)'};
  }).catch(function(){return null;});
}
/* "갓(식물)"으로 검색했더니 전통 갓(모자) 사진이 나온 사고의 원인 - 한국어
   위키백과에 국명과 완전히 같은 제목의 동음이의 문서(갓/모자, 배/과일·배·
   신체부위 등)가 존재하면, title=국명으로만 REST 요약 API를 호출했을 때
   식물과 무관한 문서의 대표 이미지를 그대로 가져오게 된다. 문서 제목이
   같다고 같은 대상이라는 보장이 없으므로, 반환된 문서가 실제로 우리가 찾는
   학명의 그 종을 가리키는 문서인지 위키데이터(Wikidata)의 학명 속성(P225,
   taxon name)으로 교차 검증한다 - 위키백과 요약 API 응답에 포함된
   wikibase_item(Q-id)로 위키데이터 항목을 조회해 P225 값이 우리 학명과
   글자 그대로 일치할 때만 채택하고, 검증에 실패하거나 학명 속성 자체가
   없는(=식물 분류군 문서가 아닌) 경우는 조용히 버린다("정확한 데이터만
   신뢰" 원칙과 동일). */
function wikidataTaxonMatches(qid,clean){
  if(!qid||!clean)return Promise.resolve(false);
  var url='https://www.wikidata.org/wiki/Special:EntityData/'+encodeURIComponent(qid)+'.json';
  return fetch(url).then(function(r){return r.ok?r.json():null;}).then(function(j){
    var ent=j&&j.entities&&j.entities[qid];
    var p225=ent&&ent.claims&&ent.claims.P225;
    if(!p225||!p225.length)return false;
    return p225.some(function(c){
      var v=c.mainsnak&&c.mainsnak.datavalue&&c.mainsnak.datavalue.value;
      return v&&cleanSciName(v).toLowerCase()===clean.toLowerCase();
    });
  }).catch(function(){return false;});
}
function fetchWikiThumb(lang,title,sciNm){
  if(!title)return Promise.resolve(null);
  var clean=cleanSciName(sciNm);
  if(!clean)return Promise.resolve(null); /* 학명이 없으면 동음이의 검증이 불가능 - 신뢰하지 않는다 */
  var url='https://'+lang+'.wikipedia.org/api/rest_v1/page/summary/'+encodeURIComponent(title);
  return fetch(url).then(function(r){return r.ok?r.json():null;}).then(function(j){
    if(!j||!j.thumbnail||!j.thumbnail.source)return null;
    return wikidataTaxonMatches(j.wikibase_item,clean).then(function(ok){
      return ok?{url:j.thumbnail.source,credit:'Wikipedia'}:null;
    });
  }).catch(function(){return null;});
}
/* GBIF(Global Biodiversity Information Facility, 지구생물다양성정보기구)
   공개 관측기록 API - https://techdocs.gbif.org/en/openapi/ . 인증키가
   필요 없는 GET 공개 API로, 학명으로 실제 관측(occurrence) 기록을 검색해
   그 기록에 첨부된 사진(mediaType=StillImage)을 가져온다. 전 세계 표본관·
   시민과학 기록을 모두 아우르는 자료라 iNaturalist·위키에 없는 종도 종종
   커버되므로, 두 소스에 이어지는 추가 폴백으로 둔다. 저작권 정보(라이선스·
   소유자)는 media 항목의 license/rightsHolder(없으면 기록자 recordedBy)를
   그대로 출처 표기에 반영한다. */
/* GBIF의 scientificName= 검색 파라미터는 GBIF 자체 분류체계(backbone
   taxonomy)를 기준으로 이명(synonym)·유사 학명까지 fuzzy하게 걸어준다 -
   즉 우리가 요청한 학명과 실제로 다른(그러나 GBIF가 "같다"고 보는) 종의
   기록이 섞여 나올 수 있다는 뜻이다("해외 명칭이 다른 자료" 오염의 실제
   경로). 국립수목원의 국가표준학명이 곧 기준이므로, 응답에 실린 기록 자체의
   species/scientificName이 우리가 요청한 학명과 문자 그대로 일치하지 않으면
   신뢰하지 않고 버린다 - 완전 일치만 채택. */
function gbifNameMatches(rec,clean){
  var cands=[rec.species,rec.scientificName].filter(Boolean).map(function(s){return cleanSciName(s).toLowerCase();});
  return cands.indexOf(clean.toLowerCase())!==-1;
}
/* "학명이 같아도 사진 속 수종이 다르게 보인다"는 지적의 실제 원인 중 하나 -
   GBIF 기록의 basisOfRecord가 PRESERVED_SPECIMEN(표본관 압착표본)이면 말려서
   납작해진 채 종이에 붙은 사진이라, 같은 학명의 살아있는 식물 사진과 나란히
   놓았을 때 완전히 다른 모습으로 보인다. 실제 관찰·생체 기록만 신뢰한다. */
var GBIF_LIVE_BASIS={HUMAN_OBSERVATION:1,MACHINE_OBSERVATION:1,LIVING_SPECIMEN:1,OBSERVATION:1};
function gbifIsLivePhoto(rec){return !!GBIF_LIVE_BASIS[rec.basisOfRecord];}
function fetchGbifPhoto(sciNm){
  var clean=cleanSciName(sciNm);
  if(!clean)return Promise.resolve(null);
  var url='https://api.gbif.org/v1/occurrence/search?scientificName='+encodeURIComponent(clean)+'&mediaType=StillImage&limit=20';
  return fetch(url).then(function(r){return r.ok?r.json():null;}).then(function(d){
    var list=(d&&Array.isArray(d.results))?d.results:[];
    for(var i=0;i<list.length;i++){
      if(!gbifNameMatches(list[i],clean))continue; /* 학명이 문자 그대로 다르면 통째로 스킵 */
      if(!gbifIsLivePhoto(list[i]))continue; /* 표본관 압착표본 등은 제외 */
      var media=list[i].media;
      if(!Array.isArray(media))continue;
      for(var j=0;j<media.length;j++){
        var m=media[j];
        if(m.type==='StillImage'&&m.identifier){
          var holder=m.rightsHolder||list[i].rightsHolder||list[i].recordedBy;
          return {url:m.identifier,credit:'사진 · GBIF'+(holder?(' ('+holder+')'):'')};
        }
      }
    }
    return null;
  }).catch(function(){return null;});
}
/* 산림청 "수피 이미지 데이터 조회 서비스"(getImageForestList): 향명(국명)으로
   조회하며, 나무 종(주로 교목)의 수피(나무껍질) 근접 사진만 제공한다. 꽃·전체
   수형 사진이 아니라 "이 나무 껍질이 이렇게 생겼다"는 별도 성격의 자료이므로,
   iNaturalist·위키에 사진이 전혀 없을 때의 마지막 대체 수단으로만 쓴다(없는
   것보다는 낫지만, 꽃 사진을 기대하는 자리에 수피 사진이 나오는 것을 막기
   위해 우선순위를 가장 낮게 둔다). 초본류(꽃 등)는 대부분 0건으로 응답한다. */
function fetchBarkPhoto(korNm){
  if(!korNm)return Promise.resolve(null);
  var u='https://apis.data.go.kr/1400000/imageForest/getImageForestList?serviceKey='+encodeURIComponent(KEY)+'&commonNm='+encodeURIComponent(korNm)+'&numOfRows=1&pageNo=1&_type=json';
  return fetch(u).then(function(r){return r.ok?r.json():null;}).then(function(j){
    var res=(j&&j.response)||{};
    if((res.header||{}).resultCode!=='00')return null;
    var items=(res.body&&res.body.items&&res.body.items.item)||null;
    var it=Array.isArray(items)?items[0]:items;
    if(!it||!it.photoFileUrl)return null;
    return {url:it.photoFileUrl,credit:'수피 사진 · 산림청 국립수목원'+(it.photographingRgn?' ('+it.photographingRgn+')':'')};
  }).catch(function(){return null;});
}
/* ---- 상세보기 전용: 사진을 "가능한 한 많이" 모아 슬라이드로 보여주기 ----
   카드 그리드에서는 대표 사진 1장(loadCardImage, 위)만 있으면 충분하지만,
   식물을 클릭해 상세창을 열었을 때는 여러 장을 한 번에 보고 싶다는 요청에
   따라 소스별로 "찾는 즉시 멈추기"가 아니라 "가능한 만큼 모으기"로 바꾼
   별도 함수들을 둔다. iNaturalist는 taxa 조회 응답 안에 이미 여러 장
   (taxon_photos)이 들어있어 추가 요청 없이 여러 장을 얻고, GBIF는 관측기록을
   여러 건 모아 사진이 달린 기록들을 전부 훑는다. 같은 URL은 중복 제거하고,
   과도한 로딩을 막기 위해 총 12장으로 제한한다. */
function fetchINatPhotos(sciNm){
  var clean=cleanSciName(sciNm);
  if(!clean)return Promise.resolve([]);
  var url='https://api.inaturalist.org/v1/taxa?q='+encodeURIComponent(clean)+'&per_page=1';
  return fetch(url).then(function(r){return r.ok?r.json():null;}).then(function(j){
    var t=j&&j.results&&j.results[0];
    if(!t||t.iconic_taxon_name!=='Plantae')return [];
    if(String(t.name).toLowerCase()!==clean.toLowerCase())return [];
    var photos=(t.taxon_photos||[]).map(function(tp){return tp.photo;}).filter(function(p){return p&&p.license_code;});
    return photos.slice(0,8).map(function(p){
      return {url:p.medium_url||p.url,credit:(p.attribution_name?p.attribution_name+', ':'')+'CC '+p.license_code.replace('cc-','').toUpperCase()+' (iNaturalist)'};
    });
  }).catch(function(){return [];});
}
function fetchGbifPhotos(sciNm){
  var clean=cleanSciName(sciNm);
  if(!clean)return Promise.resolve([]);
  var url='https://api.gbif.org/v1/occurrence/search?scientificName='+encodeURIComponent(clean)+'&mediaType=StillImage&limit=20';
  return fetch(url).then(function(r){return r.ok?r.json():null;}).then(function(d){
    var list=(d&&Array.isArray(d.results))?d.results:[];
    var seen={},out=[];
    list.forEach(function(rec){
      if(!gbifNameMatches(rec,clean))return; /* 학명이 다르면(이명·유사종) 통째로 제외 */
      if(!gbifIsLivePhoto(rec))return; /* 표본관 압착표본 등은 제외 */
      var media=rec.media;
      if(!Array.isArray(media))return;
      media.forEach(function(m){
        if(m.type==='StillImage'&&m.identifier&&!seen[m.identifier]){
          seen[m.identifier]=true;
          var holder=m.rightsHolder||rec.rightsHolder||rec.recordedBy;
          out.push({url:m.identifier,credit:'사진 · GBIF'+(holder?(' ('+holder+')'):'')});
        }
      });
    });
    return out.slice(0,8);
  }).catch(function(){return [];});
}
function fetchBarkPhotos(korNm){
  if(!korNm)return Promise.resolve([]);
  var u='https://apis.data.go.kr/1400000/imageForest/getImageForestList?serviceKey='+encodeURIComponent(KEY)+'&commonNm='+encodeURIComponent(korNm)+'&numOfRows=4&pageNo=1&_type=json';
  return fetch(u).then(function(r){return r.ok?r.json():null;}).then(function(j){
    var res=(j&&j.response)||{};
    if((res.header||{}).resultCode!=='00')return [];
    var items=(res.body&&res.body.items&&res.body.items.item)||null;
    var list=Array.isArray(items)?items:(items?[items]:[]);
    return list.filter(function(it){return it&&it.photoFileUrl;}).map(function(it){
      return {url:it.photoFileUrl,credit:'수피 사진 · 산림청 국립수목원'+(it.photographingRgn?' ('+it.photographingRgn+')':'')};
    });
  }).catch(function(){return [];});
}
function dedupePhotos(list){
  var seen={},out=[];
  list.forEach(function(p){if(p&&p.url&&!seen[p.url]){seen[p.url]=true;out.push(p);}});
  return out;
}
function fetchNongsaroPhotoList(korNm,sciNm){
  return nongsaroDataReady.then(function(){
    return fetchGardenMatch(korNm,sciNm).then(function(g){
      return nongsaroGardenPhotos(g).concat(nongsaroHerbWeedPhotos(sciNm));
    });
  }).catch(function(){return [];});
}
/* 사진 신뢰도 순서 - "학명이 같아도 사진 속 수종이 다르게 보인다"는 지적에
   따라, 한국 정보를 최우선으로 두고 검증이 약한 소스는 뒤로 밀거나 아예
   뺐다: 국립수목원 표준식물목록이미지정보서비스(국립수목원이 표준식물목록
   학명에 직접 매칭해둔 공식 이미지)를 가장 앞에, 그 다음 농사로(농촌진흥청
   실측 사진, 학명까지 확인된 매칭), 그 다음 한국어 위키(한국에서 실제로 이
   이름으로 통용되는 모습), 그 다음 iNaturalist(학명 완전일치+라이선스 확인된
   관측사진), 그 다음 GBIF(마찬가지로 학명 완전일치, 표본관 압착표본은 제외).
   영어 위키백과는 한 장짜리 이미지가 교차검증 없이 그대로 대표사진으로 쓰이는
   구조라 오분류 위험이 가장 커서 후보에서 뺐다("해외 명칭이 다른 자료는
   삭제" 원칙과 같은 맥락). 성격이 다른 수피 사진(산림청)은 맨 뒤에 붙인다.

   속도 최적화: 국립수목원 이미지는 페이지 로드 시 이미 통째로 받아 메모리에
   있어 사실상 즉시 응답되고, 농사로도 후보 목록 자체는 이미 메모리에 있다
   (학명까지 확인하는 경우에만 추가 요청 1회). 반면 위키·iNaturalist·GBIF·
   수피는 매번 새로 네트워크를 타야 해서 느리다. 예전에는 6개 소스를 모두
   Promise.all로 묶어서 기다렸기 때문에, 가장 신뢰도 높은 국립수목원 사진이
   이미 도착해 있어도 가장 느린 소스가 끝날 때까지 슬라이드가 비어 있었다.
   이제 "빠른 소스"(국립수목원+농사로)가 도착하는 즉시 먼저 보여주고("fast"),
   "느린 소스"까지 다 모이면 한 번 더 갱신한다("all") - 호출부(pDetail)에서
   fast가 오면 먼저 렌더링, all이 오면 최종본으로 다시 렌더링한다. */
function fetchAllPhotos(korNm,sciNm){
  var fast=Promise.all([
    fetchNatureImagePhotos(sciNm),
    fetchNongsaroPhotoList(korNm,sciNm)
  ]).then(function(res){return dedupePhotos([].concat(res[0]||[],res[1]||[]));});
  var slow=Promise.all([
    fetchWikiThumb('ko',korNm,sciNm),
    fetchINatPhotos(sciNm),
    fetchGbifPhotos(sciNm),
    fetchBarkPhotos(korNm)
  ]).then(function(res){return [].concat(res[0]?[res[0]]:[],res[1]||[],res[2]||[],res[3]||[]);});
  var all=Promise.all([fast,slow]).then(function(res){return dedupePhotos(res[0].concat(res[1])).slice(0,12);});
  return {fast:fast,all:all};
}
/* 카드 그리드용 대표 사진 1장도 상세 슬라이드와 같은 신뢰도 순서(국립수목원 >
   농사로 > 한국어 위키 > iNaturalist > GBIF > 수피)를 따른다. 속도 최적화:
   국립수목원 이미지는 이미 메모리에 있어 사실상 즉시 응답되므로, 매칭되면
   나머지(위키·iNaturalist·GBIF·수피, 매번 네트워크 요청이 필요해 느림)를
   기다리지 않고 바로 그 사진을 쓴다. 다만 매칭이 안 되는 종(전체의 절반
   가량)까지 느려지면 안 되므로, 느린 소스들은 국립수목원 응답을 기다리지
   않고 처음부터 동시에 요청해둔다 - 결과적으로 국립수목원에 사진이 있으면
   즉시, 없으면 예전과 동일한 속도로 나머지 소스 중 먼저 오는 것을 쓴다. */
function fetchNongsaroCardPhoto(korNm,sciNm){
  return fetchNongsaroPhotoList(korNm,sciNm).then(function(photos){return photos[0]||null;});
}
function loadCardImage(korNm,sciNm,imgWrap,onDone){
  var key=korNm+'|'+sciNm;
  if(pImgCache[key]!==undefined){
    applyThumb(imgWrap,pImgCache[key]);
    if(onDone)onDone(pImgCache[key]&&pImgCache[key].credit);
    return Promise.resolve();
  }
  var naturePromise=fetchNatureImagePhoto(sciNm);
  var fallbackPromise=Promise.all([
    fetchNongsaroCardPhoto(korNm,sciNm),
    fetchWikiThumb('ko',korNm,sciNm),
    fetchINatPhoto(sciNm),
    fetchGbifPhoto(sciNm)
  ]).then(function(res){
    var r=res[0]||res[1]||res[2]||res[3];
    if(r)return r;
    return fetchBarkPhoto(korNm);
  });
  return naturePromise.then(function(r){
    return r||fallbackPromise;
  }).then(function(r){
    pImgCache[key]=r;
    applyThumb(imgWrap,r);
    if(onDone)onDone(r&&r.credit);
  });
}
function applyThumb(imgWrap,result){
  if(!imgWrap||!imgWrap.isConnected)return;
  if(result&&result.url){
    var img=document.createElement('img');
    img.src=result.url;
    img.alt='';
    img.loading='lazy';
    img.onerror=function(){imgWrap.innerHTML=PLACEHOLDER_ICON;};
    imgWrap.innerHTML='';
    imgWrap.appendChild(img);
    if(result.credit)imgWrap.setAttribute('data-credit',result.credit);
  } else {
    imgWrap.innerHTML=PLACEHOLDER_ICON;
  }
}

/* 상세창 상단 이미지 영역을 여러 장짜리 슬라이드로 그린다(라이브러리 없이
   순수 transform:translateX). 사진이 1장 이하면 화살표/점 없이 기존처럼
   단일 이미지로만 보여주고, 2장 이상일 때만 좌우 화살표·점 인디케이터·
   스와이프(터치)/드래그(마우스)를 붙인다. 사진 자체가 없으면 기존 자리표시
   이모지를 그대로 쓴다. */
function renderImageSlider(wrap,creditEl,photos){
  wrap.innerHTML='';
  wrap.style.position='relative';
  if(!photos||!photos.length){
    wrap.innerHTML=PLACEHOLDER_ICON;
    if(creditEl)creditEl.style.display='none';
    return;
  }
  var idx=0;
  var track=document.createElement('div');
  track.style.cssText='display:flex;height:100%;transition:transform .25s ease;will-change:transform';
  photos.forEach(function(p){
    var slide=document.createElement('div');
    slide.style.cssText='flex:0 0 100%;height:100%';
    var img=document.createElement('img');
    img.src=p.url;img.alt='';img.loading='lazy';
    img.style.cssText='width:100%;height:100%;object-fit:cover;display:block';
    img.onerror=function(){slide.style.display='none';};
    slide.appendChild(img);
    track.appendChild(slide);
  });
  wrap.appendChild(track);
  var dots=null,prev=null,next=null;
  function update(){
    track.style.transform='translateX(-'+(idx*100)+'%)';
    if(creditEl){
      var c=photos[idx]&&photos[idx].credit;
      creditEl.textContent=c?'사진: '+c+' ('+(idx+1)+'/'+photos.length+')':'';
      creditEl.style.display=c?'block':'none';
    }
    if(dots)Array.prototype.forEach.call(dots.children,function(d,i){d.style.opacity=i===idx?'1':'.4';});
  }
  if(photos.length>1){
    prev=document.createElement('button');
    prev.type='button';prev.innerHTML='&#10094;';
    prev.style.cssText='position:absolute;left:12px;top:50%;transform:translateY(-50%);width:32px;height:32px;border-radius:50%;border:none;background:rgba(18,18,18,.55);color:#fff;cursor:pointer;font-size:14px;line-height:1';
    prev.onclick=function(e){e.stopPropagation();idx=(idx-1+photos.length)%photos.length;update();};
    next=document.createElement('button');
    next.type='button';next.innerHTML='&#10095;';
    next.style.cssText='position:absolute;right:12px;top:50%;transform:translateY(-50%);width:32px;height:32px;border-radius:50%;border:none;background:rgba(18,18,18,.55);color:#fff;cursor:pointer;font-size:14px;line-height:1';
    next.onclick=function(e){e.stopPropagation();idx=(idx+1)%photos.length;update();};
    wrap.appendChild(prev);wrap.appendChild(next);
    dots=document.createElement('div');
    dots.style.cssText='position:absolute;bottom:10px;left:0;right:0;display:flex;justify-content:center;gap:6px';
    photos.forEach(function(_,i){
      var d=document.createElement('span');
      d.style.cssText='width:6px;height:6px;border-radius:50%;background:#fff;opacity:.4;cursor:pointer;display:inline-block';
      d.onclick=function(e){e.stopPropagation();idx=i;update();};
      dots.appendChild(d);
    });
    wrap.appendChild(dots);
    var startX=null;
    wrap.addEventListener('touchstart',function(e){startX=e.touches[0].clientX;},{passive:true});
    wrap.addEventListener('touchend',function(e){
      if(startX==null)return;
      var dx=e.changedTouches[0].clientX-startX;
      if(Math.abs(dx)>40){if(dx<0)next.onclick(e);else prev.onclick(e);}
      startX=null;
    });
  }
  update();
}

function buildUrl(path,params){
  var p=Object.assign({_type:'json'},params);
  var qs=Object.keys(p).map(function(k){return k+'='+encodeURIComponent(p[k]);}).join('&');
  return PB+path+'?'+qs;
}

/* ---- 정원 식물 정보 가공 (색상/광조건/생활형) ----
   이 API에는 색상·광조건·일년초/여러해살이 같은 구조화된 필드가 없으므로,
   이미 발급받은 도감 상세정보(plantPilbkInfo)의 자유서술 텍스트(형태·생육환경)에서
   키워드를 추출해 가공한다. 정확한 원본 구조화 데이터가 아닌 휴리스틱 추정치임. */
var COLOR_MAP=[
  {re:/빨간|붉은|적색|다홍|주홍|진홍/,label:'빨강'},
  {re:/분홍|연분홍|핑크/,label:'분홍'},
  {re:/노란|황색|노랑/,label:'노랑'},
  {re:/주황|오렌지/,label:'주황'},
  {re:/흰|백색|하양/,label:'흰색'},
  {re:/보라|자주|자색/,label:'보라'},
  {re:/파란|청색|남색/,label:'파랑'},
  {re:/녹색|초록/,label:'초록'},
  {re:/검은|흑자색/,label:'검정'}
];
function deriveAttrs(shpe,grw,flowerText){
  var text=(shpe||'')+' '+(grw||'');
  var attrs={cycle:'',light:'',colors:[]};
  if(/한해살이|일년초/.test(text))attrs.cycle='한해살이';
  else if(/두해살이|이년초/.test(text))attrs.cycle='두해살이';
  else if(/여러해살이|숙근|다년초|다년생/.test(text))attrs.cycle='여러해살이';
  else if(/교목/.test(text))attrs.cycle='목본(교목)';
  else if(/관목/.test(text))attrs.cycle='목본(관목)';
  else if(/나무껍질|수피|목질화/.test(text)){
    /* '교목'/'관목' 단어가 없어도 나무껍질·수피 언급은 목본을 뜻한다(예: 무궁화).
       높이 정보가 있으면 5m를 기준으로 교목/관목을 구분하고, 없으면 관목으로 본다. */
    var h=extractHeight(shpe);
    attrs.cycle=(h&&h.hi>=5)?'목본(교목)':'목본(관목)';
  }
  var lights=[];
  /* '양지'류 표현 외에, 조림·임업 문헌에서 흔히 쓰는 '양수(陽樹)/음수(陰樹)/
     중용수' 같은 수목 용어도 광조건 신호로 인식한다(안 그러면 목본류 다수가
     조건 미상으로 누락됨). */
  if(/양지|볕이\s*잘|햇빛을\s*좋아|양수/.test(text))lights.push('양지');
  if(/반음지|반그늘|중용수/.test(text))lights.push('반음지');
  if(/음지|응달|그늘을\s*좋아|음수/.test(text))lights.push('음지');
  attrs.light=lights.join('·');
  /* 색상은 '꽃'이 언급된 문장에서만 추출한다. 형태(shpe) 설명 전체에서 찾으면
     열매·수피·씨앗 색(예: 구과는 황갈색)까지 꽃 색으로 오인될 수 있어
     "일치도"가 떨어지기 때문 - 꽃이 언급되지 않은 문장은 제외한다.
     실제 사례(목향장미, Rosa banksiae): 이 API의 형태 설명은 종종 속(屬)
     단위의 일반론을 그대로 싣는다 - "꽃은... 흔히 적색이지만 그 밖에 여러가지
     색이 있고"처럼, 정작 이 품종은 실제로 노란색/흰색 꽃인데도 "적색"이 매칭되어
     버려 사진과 모순되는 오류가 났었다. 이런 '흔히 ~하지만 다양하다'류의 헤지
     (불확정) 문장은 이 종을 확정적으로 설명하는 문장이 아니므로, 그런 문장에서는
     색상을 아예 추출하지 않는다(틀린 값을 내느니 비워두는 쪽이 낫다). */
  var HEDGE_RE=/여러가지\s*색|다양한\s*색|품종에\s*따라|색이\s*다양|그\s*밖에|그\s*외에|이외에도|간혹|드물게/;
  var colorText;
  if(flowerText){
    /* 국가표준식물목록 CSV처럼 "꽃" 항목이 원본에서부터 이미 별도 필드로
       분리되어 있으면, 그 필드 전체가 확실히 꽃 얘기이므로 "꽃"이라는 단어가
       그 문장에 다시 나오는지 재확인할 필요가 없다(오히려 "화피"류 표현이
       없으면 걸러지던 문제까지 해소). 헤지(불확정) 문장만 제외한다. */
    colorText=flowerText.split(/[.!?]\s*/).filter(function(s){return s&&!HEDGE_RE.test(s);}).join(' ');
  } else {
    /* 필드가 분리돼 있지 않은 경우(정부 API 원문 shpe)에는 기존처럼 "꽃"이
       언급된 문장만 골라 쓴다 - 열매·수피·씨앗 색이 꽃 색으로 오인되는 것을
       막기 위함(실제 사례: 목향장미, 속 단위 일반론 "흔히 적색이지만..."). */
    var flowerSentences=(shpe||'').split(/[.!?]\s*/).filter(function(s){return /꽃|화피|화관/.test(s)&&!HEDGE_RE.test(s);});
    colorText=flowerSentences.join(' ');
  }
  COLOR_MAP.forEach(function(c){if(c.re.test(colorText)&&attrs.colors.indexOf(c.label)===-1)attrs.colors.push(c.label);});
  return attrs;
}
/* 뮤트 톤/내추럴 톤 헥사코드. 프리미엄 조경 브랜드 톤에 맞춰 채도를 낮춘
   자연스러운 색으로 매칭한다(원색 계열 지양). */
function colorSwatch(label){
  var map={'빨강':'#B1584F','분홍':'#D2A6A0','노랑':'#D2BD7E','주황':'#C68F5E','흰색':'#EFEAE0','보라':'#8E7C93','파랑':'#6E8AA0','초록':'#7C8B6F','검정':'#3A3532'};
  return map[label]||'#B7B3AA';
}
/* ---- 정원 식물 정보 가공 v2: 큐레이션 프로필 ----
   국가생물종지식정보시스템의 자유서술 텍스트(형태·생육환경·분포 등)에서
   광조건/내한성/수분/개화월/높이 등을 규칙 기반으로 추출해, 미니멀 UI
   컴포넌트에 바로 바인딩할 수 있는 정제된 데이터로 가공한다. 이모지는
   사용하지 않고, 문구는 라벨/한 문장 단위로 절제한다. */
function sunlightLabel(lightStr){
  var s=lightStr||'';
  var has=function(t){return s.indexOf(t)!==-1;};
  if(has('음지')&&!has('양지'))return '음지';
  if(has('반음지'))return '반음지';
  if(has('양지')&&has('음지'))return '반음지';
  if(has('양지'))return '양지';
  return '반음지';
}
function deriveHardiness(grw,dstrb,osDstrb){
  var text=(grw||'')+' '+(dstrb||'')+' '+(osDstrb||'');
  if(/실내|온실/.test(text)&&!/노지|전국|중부|남부/.test(text))return '실내 구성';
  if(/동해|서리\s*피해|내한성이?\s*약|한지에서는/.test(text))return '제한적 노지';
  if(/전국|내한성이?\s*강|추위에\s*강/.test(text))return '전국 노지';
  return /한국|전국/.test(dstrb||'')?'전국 노지':'제한적 노지';
}
function deriveMoisture(grw){
  var text=grw||'';
  if(/건조에?\s*강|내건성|메마른\s*곳에서도|건조한\s*곳에서도/.test(text))return '건조';
  if(/습지|물이\s*많은\s*곳|과습|다습한\s*곳을|습윤한\s*곳을\s*좋아/.test(text))return '다습';
  return '보통';
}
function extractBloomMonths(shpe){
  var text=shpe||'',months=[];
  var re=/(\d{1,2})\s*[~\-–]\s*(\d{1,2})\s*월(?:에|경)?\s*(?:개화|핀다|피며|피고|꽃(?:이)?\s*핀다|꽃(?:이)?\s*피)/g,m;
  while((m=re.exec(text))){
    var a=parseInt(m[1],10),b=parseInt(m[2],10);
    if(a>=1&&a<=12&&b>=1&&b<=12){
      if(a<=b){for(var i=a;i<=b;i++)months.push(i);}
      else{for(var i=a;i<=12;i++)months.push(i);for(var i=1;i<=b;i++)months.push(i);}
    }
  }
  if(!months.length){
    var m2=/(\d{1,2})\s*월(?:에|경)?\s*(?:개화|핀다|피며|피고|꽃(?:이)?\s*피)/.exec(text);
    if(m2){var a2=parseInt(m2[1],10);if(a2>=1&&a2<=12)months.push(a2);}
  }
  return Array.from(new Set(months)).sort(function(a,b){return a-b;});
}
function extractHeight(shpe){
  var m=/높이\s*(?:는)?\s*([\d.]+)\s*(?:[~\-–]\s*([\d.]+))?\s*m/.exec(shpe||'');
  if(!m)return null;
  var lo=parseFloat(m[1]),hi=m[2]?parseFloat(m[2]):lo;
  return {lo:lo,hi:hi};
}
var STRUCTURE_PHRASE={
  '한해살이':'한철 화려하게 피어나는 계절 초화',
  '두해살이':'두 해에 걸쳐 완성되는 초화',
  '여러해살이':'매년 정원에 돌아오는 숙근초',
  '목본(교목)':'정원의 수직선을 잡아주는 골격목',
  '목본(관목)':'공간의 경계를 부드럽게 나누는 관목'
};
var COLOR_MOOD={
  '빨강':'짙고 강렬한','분홍':'은은하고 사랑스러운','노랑':'화사하고 따스한','주황':'따뜻하고 생기 있는',
  '흰색':'맑고 정갈한','보라':'그윽하고 고급스러운','파랑':'차분하고 청량한','초록':'싱그러운','검정':'깊이 있는'
};
function curationTags(item,attrs,shpeOverride,dstrbOverride,famOverride){
  /* shpe/dstrb/fam은 정적 데이터셋으로 보강된 값이 있으면 그쪽을 우선 쓴다
     (deriveCuratedProfile에서 넘겨줌) - item 원본만 보면 정적 보강분(예: 정적
     'form' 필드의 "상록침엽교목")이 누락되어 상록/낙엽 판정 등이 어긋난다. */
  var fam=famOverride||(val(item,'familyKorNm')||val(item,'apgFamilyKorNm')||'');
  var shpe=shpeOverride!=null?shpeOverride:val(item,'shpe');
  var dstrb=dstrbOverride!=null?dstrbOverride:val(item,'dstrb');
  var tags=[];
  if(/벼과|그라스/.test(fam+shpe))tags.push('그라스류');
  if(/사초과/.test(fam))tags.push('사초류');
  if(attrs.cycle==='여러해살이')tags.push('여러해살이숙근초');
  else if(attrs.cycle==='한해살이')tags.push('한해살이초화');
  else if(attrs.cycle==='두해살이')tags.push('두해살이초화');
  else if(attrs.cycle==='목본(교목)')tags.push(/상록/.test(shpe)?'상록교목':'낙엽교목');
  else if(attrs.cycle==='목본(관목)')tags.push(/상록/.test(shpe)?'상록관목':'낙엽관목');
  if(attrs.resType==='자생종'||/자생|한국\s*특산/.test(dstrb))tags.push('자생식물');
  if(attrs.colors.length)tags.push(attrs.colors[0]+'꽃');
  return tags.slice(0,4);
}
/* ---- 원예상점 표준 카테고리 매핑 ----
   조경/원예 자재상이 실무에서 쓰는 분류(꽃나무/관목, 상록침엽수, 상록활엽수,
   낙엽교목, 정원용초본(꽃/야생화), 꽃구근, 과수/유실수, 특용/약용수, 잔디, 씨앗,
   관엽/공기정화식물, 생울타리, 덩굴식물, 수생식물, 남부수종, 희귀식물)을,
   국가생물종지식정보시스템의 자유서술 텍스트와 이미 산출된 생활형(cycle)·
   상록/낙엽 태그·내한성(hardiness)·분포(dstrb)로부터 규칙 기반으로 재구성한다.
   "조경자재"는 식물 종이 아닌 물리적 부자재라 이 데이터셋에는 대응 항목이 없어
   제외했다. 한 종이 여러 유형에 동시에 속할 수 있다(예: 유실수이면서 낙엽교목). */
var CONIFER_FAMILY_RE=/소나무과|측백나무과|주목과|개비자나무과|나한송과/;
var AQUATIC_RE=/수생|수련과|부들과|택사과|생이가래과|물옥잠|개구리밥|정수식물|부엽식물|침수식물|수변\s*식재/;
var VINE_RE=/덩굴성|덩굴져|넝쿨|만경식물/;
var HEDGE_USE_RE=/생울타리|산울타리|울타리(?:용|로)/;
var TURF_RE=/잔디/;
var BULB_RE=/구근|알뿌리|비늘줄기|알줄기|덩이뿌리/;
var FRUIT_RE=/식용.{0,10}열매|열매.{0,10}(?:식용|생식)|유실수|과수(?!원\s*관리)/;
var MEDICINAL_RE=/약용|약재|한약재|생약/;
var HOUSEPLANT_RE=/관엽식물|공기\s*정화|미세먼지\s*저감|실내\s*조경/;
var SOUTHERN_RE=/남부|제주|남해안/;
var ORIGIN_USECAT={rare:'희귀식물',seed:'씨앗'};
function deriveUseCategory(item,attrs,shpe,grwOverride,famOverride){
  var grw=grwOverride!=null?grwOverride:val(item,'grwEvrntDesc');
  var note=val(item,'note'),dstrb=val(item,'dstrb');
  var text=(shpe||'')+' '+(grw||'')+' '+(note||'');
  var fam=famOverride||(val(item,'familyKorNm')||val(item,'apgFamilyKorNm')||'');
  var nm=val(item,'plantGnrlNm')||'';
  var tags=attrs.tags||[];
  var cats=[];
  if(BULB_RE.test(text))cats.push('꽃구근');
  if(FRUIT_RE.test(text))cats.push('과수/유실수');
  if(MEDICINAL_RE.test(text))cats.push('특용/약용수');
  if(VINE_RE.test(shpe||''))cats.push('덩굴식물');
  if(AQUATIC_RE.test(text+fam))cats.push('수생식물');
  if(HEDGE_USE_RE.test(text))cats.push('생울타리');
  if(TURF_RE.test(nm+text))cats.push('잔디');
  if(HOUSEPLANT_RE.test(text)||attrs.hardiness==='실내 구성')cats.push('관엽/공기정화식물');
  if(attrs.hardiness==='제한적 노지'&&SOUTHERN_RE.test(dstrb||''))cats.push('남부수종');
  if(tags.indexOf('상록교목')!==-1){
    if(CONIFER_FAMILY_RE.test(fam)||/침엽수|바늘잎/.test(text))cats.push('상록침엽수');
    else cats.push('상록활엽수');
  }
  if(tags.indexOf('낙엽교목')!==-1)cats.push('낙엽교목');
  if(tags.indexOf('상록관목')!==-1||tags.indexOf('낙엽관목')!==-1)cats.push('꽃나무/관목');
  if(tags.indexOf('여러해살이숙근초')!==-1||tags.indexOf('한해살이초화')!==-1||tags.indexOf('두해살이초화')!==-1)cats.push('정원용초본(꽃/야생화)');
  return Array.from(new Set(cats));
}
function buildTagline(item,attrs,shpeOverride,famOverride){
  var fam=famOverride||(val(item,'familyKorNm')||val(item,'apgFamilyKorNm')||'');
  var shpe=shpeOverride!=null?shpeOverride:val(item,'shpe');
  if(/벼과|그라스/.test(fam+shpe))return '바람에 흔들리며 정원에 리듬을 더하는 질감 소재';
  if(/사초과/.test(fam))return '가늘고 정갈한 잎선으로 공간에 여백을 더하는 소재';
  var structure=STRUCTURE_PHRASE[attrs.cycle]||'정원에 은은한 존재감을 더하는 식재';
  if(attrs.colors.length){
    var mood=COLOR_MOOD[attrs.colors[0]]||'단정한';
    return mood+' '+attrs.colors[0]+'빛 꽃을 피우는 '+structure;
  }
  return structure;
}
function buildPlantingTip(attrs,height){
  if(attrs.cycle==='목본(교목)')return '성목의 수관폭을 고려해 반경 2~3m 안에는 다른 교목 식재를 피하는 것이 좋습니다.';
  if(attrs.cycle==='목본(관목)')return '군식할 때 40~60cm 간격을 두면 자연스러운 볼륨감을 얻을 수 있습니다.';
  if(height&&height.hi>=1)return '키가 있는 편이라 화단의 뒷줄이나 중심부에 배치하면 좋습니다.';
  if(height&&height.hi<0.3)return '낮게 퍼지는 성질이 있어 화단 가장자리나 지피용으로 적합합니다.';
  return '주변 식물과 20~30cm 간격을 두면 통풍이 원활해 관리가 수월해집니다.';
}
function buildStory(item,dstrb){
  var note=val(item,'note').trim();
  var orplc=val(item,'orplcNm').trim().replace(/원산지?$/,'').replace(/[,\s]+$/,'');
  if(note){
    var first=note.split(/[.!?]\s*/)[0];
    return first+(first.length<note.length?'…':'.');
  }
  if(orplc)return orplc+'가 원산지로, 오랜 시간을 거쳐 국내 정원에 자리잡은 식물입니다.';
  if(/한국|전국/.test(dstrb||''))return '한반도 각지에 자생하며 우리 자연 풍경의 일부를 이루어 온 식물입니다.';
  return '오랜 시간 정원과 조경 현장에서 사랑받아 온 식물입니다.';
}
/* staticMatch(getStaticMatch()의 결과)가 있으면, 국가표준식물목록 CSV에서
   가공한 항목별 분리 서술(꽃/잎/열매/줄기 등)을 우선 반영한 텍스트를 만들어
   기존 정규식 추출기에 넘긴다. 꽃 색상을 예로 들면, 원래는 "형태" 통짜
   텍스트 전체에서 "꽃"이 들어간 문장만 걸러내 썼는데, 이제 애초에 꽃만
   서술된 문장(flower)이 있으니 열매·수피 색과 섞여 오탐이 날 여지가 준다.
   또한 이 정적 데이터에는 없던 종(수집 시점 5,400여종 한정)은 기존 방식
   그대로 동작해 커버리지가 줄어들지 않는다. */
/* CSV 원본 필드(꽃/잎/열매/줄기...)를 그냥 공백으로 이어붙이면, 필드 끝에
   마침표가 없는 경우(흔함) 문장 경계가 사라져 "꽃은 5월에 핀다 열매는
   붉은색이다"처럼 서로 다른 부위 설명이 한 문장으로 뭉개진다 - 이 상태에서
   "꽃이 언급된 문장"을 찾으면 열매 색을 꽃 색으로 잘못 채택하는 사고가 난다
   (실측: 사진과 다른 꽃색). 필드 사이에 마침표를 강제로 넣어 문장 경계를
   보존한다. */
function joinField(s){s=(s||'').trim();if(!s)return'';return /[.!?]$/.test(s)?s:s+'.';}
function staticSpeciesText(sp){
  if(!sp)return{shpe:'',grw:'',dstrb:''};
  var shpeParts=[sp.form,sp.height,sp.flower,sp.leaf,sp.fruit,sp.stem,sp.root,sp.similar,sp.note].filter(Boolean).map(joinField);
  var grwParts=[sp.env,sp.propagate].filter(Boolean).map(joinField);
  var dstrbParts=[sp.habitat,sp.orig].filter(Boolean).map(joinField);
  return {shpe:shpeParts.join(' '),grw:grwParts.join(' '),dstrb:dstrbParts.join(' ')};
}
function deriveCuratedProfile(item,staticMatch,sc){
  var sp=staticMatch&&staticMatch.species,nm=staticMatch&&staticMatch.name;
  var st=staticSpeciesText(sp);
  var shpe=(st.shpe?st.shpe+' ':'')+val(item,'shpe');
  var grw=(st.grw?st.grw+' ':'')+val(item,'grwEvrntDesc');
  var dstrb=(st.dstrb?st.dstrb+' ':'')+val(item,'dstrb');
  var osDstrb=val(item,'osDstrb');
  var fam=(val(item,'familyKorNm')||val(item,'apgFamilyKorNm')||(nm&&nm.family)||'');
  var attrs=deriveAttrs(shpe,grw,sp&&sp.flower);
  attrs.sunlight=sunlightLabel(attrs.light);
  attrs.hardiness=deriveHardiness(grw,dstrb,osDstrb);
  attrs.moisture=deriveMoisture(grw);
  attrs.bloomMonths=extractBloomMonths(shpe);
  attrs.colorHex=attrs.colors.map(colorSwatch);
  /* 국가표준식물목록의 자원구분(자생종/재배품종/외국종)·멸종위기·희귀·특산종
     코드는 자유서술 텍스트를 추측하는 게 아니라 국립수목원이 직접 평가해둔
     값이므로, 있으면 기존 정규식 추정보다 신뢰도가 높은 별도 플래그로 둔다. */
  attrs.resType=nm&&nm.resType||'';
  attrs.rareFlag=!!(nm&&nm.rare==='1');
  attrs.endemicFlag=!!(nm&&nm.endemic==='1');
  attrs.endgFlag=!!(nm&&(nm.endg1==='1'||nm.endg2==='1'));
  /* shpe/grw/dstrb/fam은 모두 정적 보강분이 합쳐진 값을 그대로 넘긴다 - 각
     함수가 item 원본만 다시 들여다보면 정적 보강 내용(예: 정적 'form' 필드의
     "상록침엽교목")을 놓치게 된다. */
  attrs.tags=curationTags(item,attrs,shpe,dstrb,fam);
  attrs.useCats=deriveUseCategory(item,attrs,shpe,grw,fam);
  attrs.tagline=buildTagline(item,attrs,shpe,fam);
  attrs.plantingTip=buildPlantingTip(attrs,extractHeight(shpe));
  attrs.story=buildStory(item,dstrb);
  attrs.hasStory=bookHasStory(sc||(sp&&sp.sc)||(nm&&nm.sc)||val(item,'plantSpecsScnm'));
  return attrs;
}
/* 예전엔 광조건/내한성/수분/개화월/식재팁/태그/스토리를 한 블록(curatedProfileHtml)
   으로 다 보여줬는데, 가드너·조경전문가·식물전문가가 원하는 정보가 서로 달라서
   ("검색부터 화면 구성까지" 역할별 재편 요청) 두 개로 쪼갰다 - 실내에서 키우는
   관점(광조건/수분/개화월/식재팁)은 정원 가이드 탭에, 전문적 분류·내한성·자생
   여부 같은 스펙성 정보는 조경 스펙 탭에 배치한다. */
function envBarHtml(label,options,active){
  return '<div style="margin-bottom:20px">'
    +'<p style="font-size:11px;letter-spacing:1px;color:#ABABAB;margin:0 0 8px">'+esc(label)+'</p>'
    +'<div style="display:flex;gap:6px">'
    +options.map(function(o){var on=(o===active);return '<span style="flex:1;text-align:center;padding:8px 0;font-size:12px;letter-spacing:.2px;border:1px solid '+(on?'#121212':'#E6E6E6')+';background:'+(on?'#121212':'#fff')+';color:'+(on?'#fff':'#ABABAB')+'">'+esc(o)+'</span>';}).join('')
    +'</div></div>';
}
function envTripleHtml(p){
  var monthCells='';
  for(var m=1;m<=12;m++){
    var active=p.bloomMonths.indexOf(m)!==-1;
    monthCells+='<span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;font-size:11px;border-radius:50%;'+(active?('background:'+(p.colorHex[0]||'#8E8B82')+';color:#fff;font-weight:600'):'background:#F2F1EE;color:#B7B3AA')+'">'+m+'</span>';
  }
  return ''
    +envBarHtml('광조건',['양지','반음지','음지'],p.sunlight)
    +envBarHtml('수분',['건조','보통','다습'],p.moisture)
    +'<p style="font-size:11px;letter-spacing:1px;color:#ABABAB;margin:0 0 8px">개화 시기 (월)</p>'
    +'<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:20px">'+monthCells+'</div>';
}
function curatedLandscapeHtml(p){
  var badges=[].concat(p.useCats||[],p.tags||[]);
  var tagsHtml=badges.map(uiTag).join('');
  return ''
    +(tagsHtml?'<div style="margin-bottom:20px">'+tagsHtml+'</div>':'')
    +envBarHtml('내한성',['전국 노지','제한적 노지','실내 구성'],p.hardiness)
    +(p.story?'<p style="font-size:14px;color:#787878;line-height:1.8;margin:20px 0 0">'+esc(p.story)+'</p>':'');
}
/* "정원 가이드 탭을 개요에 포함, 학명/과명/영명/광조건/수분/개화시기 순으로"
   요청에 따라 개요 탭을 이름이 고정된 슬롯(div id)들의 나열로 만든다 -
   출처별 분기(도감/표본/특산.../정적 데이터셋)마다 데이터가 서로 다른
   타이밍에 비동기로 도착해도, 슬롯 id가 고정돼 있어 각 조각을 해당 슬롯에만
   써넣으면 화면 순서는 항상 동일하게 유지된다(먼저 도착한 조각이 뒤 슬롯에
   끼어들 걱정이 없다). */
function overviewSkeleton(){
  /* "이야기도 개요에 포함" 요청에 따라 이야기 슬롯(pdstory)을 개요 맨 끝에
     둔다 - 사실 정보(형태/분포 등)와 실용 정보(조경·농사로)를 먼저 읽고,
     이름의 유래·숲이야기 같은 서술형 콘텐츠는 마지막에 자연스럽게 이어지는
     순서다. */
  return ['pdcore','pdenv','pdplanting','pdbody','pdlandscape','pdnsgarden','pdnslandscape','pdbookgarden','pdbooklandscape','pdacademic','pdgeneral','pdstory']
    .map(function(id){return '<div id="'+id+'"></div>';}).join('');
}
function setEl(id,html){var el=document.getElementById(id);if(el)el.innerHTML=html||'';}
/* 학명은 검색 결과에 항상 있어 즉시 채울 수 있지만, 과명·영명은 출처(도감/
   표본/정적 데이터셋)에 따라 조금 늦게 도착한다 - 도착하는 대로 다시 호출해도
   같은 슬롯을 덮어쓸 뿐이라 안전하다. */
function setPdCore(sc,family,engNm){
  var rows=[];
  pushRow(rows,'학명',sc);
  pushRow(rows,'과명',family);
  pushRow(rows,'영명',engNm);
  setEl('pdcore',rowsTable(rows));
}
/* "정원에 은은한 존재감을 더하는 식재" 같은 자동 생성 한 줄 태그라인은
   군더더기라는 지적에 따라 삭제 요청 - pdtagline 슬롯 자체를
   overviewSkeleton에서 없앴으므로 여기서도 채우지 않는다(식재 팁은 유지). */
function applyCuratedProfile(p){
  setEl('pdenv',p?envTripleHtml(p):'');
  setEl('pdplanting',(p&&p.plantingTip)?'<p style="font-size:14px;color:#121212;line-height:1.8;margin:0 0 20px"><span style="font-weight:600">식재 팁</span> · '+esc(p.plantingTip)+'</p>':'');
  setEl('pdlandscape',p?curatedLandscapeHtml(p):'');
}
var pAttrCache={};
/* plantPilbkInfo(종 상세) 원본 응답을 한 번만 받아 공유하는 캐시.
   전에는 카드에 정원정보 칩을 채울 때(fetchPlantAttrs)와 카드를 클릭해 상세
   팝업을 열 때(pDetail) 같은 종의 같은 데이터를 두 번 따로 요청했다 - 카드가
   이미 화면에 보이는 시점에 칩 정보를 미리 받아두고도, 클릭하면 또 한 번
   기다려야 했던 것. 이제는 먼저 받은 쪽이 캐시해두면 나중 쪽은 네트워크 요청
   없이 즉시(0ms) 재사용한다. */
var pItemCache={};
function fetchPilbkItem(no){
  if(pItemCache[no])return Promise.resolve(pItemCache[no]);
  var cached=cacheGet('item|'+no,DETAIL_CACHE_TTL);
  if(cached!==undefined){pItemCache[no]=cached;return Promise.resolve(cached);}
  var url=buildUrl('/plantPilbkInfo',{serviceKey:KEY,reqPlantPilbkNo:no});
  return fetchJson(url).then(function(data){
    var res=(data&&data.response)||{};
    var header=res.header||{};
    if(header.resultCode==='03')return null; /* 정상적인 '데이터 없음' */
    if(header.resultCode!=='00')throw new Error(header.resultMsg||'상세정보를 불러올 수 없습니다.');
    var item=(res.body&&res.body.item)||{};
    pItemCache[no]=item;
    cacheSet('item|'+no,item);
    return item;
  });
}
function fetchPlantAttrs(no,sciNm){
  if(pAttrCache[no])return Promise.resolve(pAttrCache[no]);
  return curationDataReady.then(function(){
    return fetchPilbkItem(no).then(function(item){
      if(!item)return null;
      var sc=sciNm||val(item,'plantSpecsScnm');
      var match=getStaticMatch(sc);
      var attrs=deriveCuratedProfile(item,match,sc);
      pAttrCache[no]=attrs;
      return attrs;
    });
  }).catch(function(){return null;});
}
/* 도감 상세(no)가 없는 항목(특산/적색/외래/민속/종자정보 출처 등)도, 학명이
   정적 데이터셋과 일치하면 실시간 API 호출 없이 정적 데이터만으로 정원정보
   카드를 채울 수 있다 - 이전에는 이런 항목엔 정원정보 칩이 전혀 없었다. */
function attrsCacheKeyFor(it){return it.no?it.no:('u'+it._uid);}
function staticOnlyAttrs(it){
  var key=attrsCacheKeyFor(it);
  if(pAttrCache[key])return Promise.resolve(pAttrCache[key]);
  return curationDataReady.then(function(){
    var match=getStaticMatch(it.sc);
    if(!match)return null;
    var attrs=deriveCuratedProfile({},match,it.sc);
    pAttrCache[key]=attrs;
    return attrs;
  }).catch(function(){return null;});
}
/* renderPage/refreshCard가 공유하는 정원정보 로딩·렌더 로직. 도감 항목(no
   있음)은 실시간 API+정적 보강, 그 외 항목은 학명이 정적 데이터셋과 일치할
   때만 정적 데이터 단독으로 채운다(네트워크 요청 없이). */
function loadAndRenderAttrs(d,it){
  var key=attrsCacheKeyFor(it);
  if(pAttrCache[key]){
    renderCardAttrs(d,pAttrCache[key]);
    it._attrsRich=isAttrsRich(pAttrCache[key]);
    reflowGrid();
    return;
  }
  var task=it.no?function(){return fetchPlantAttrs(it.no,it.sc);}:function(){return staticOnlyAttrs(it);};
  limitCard(task).then(function(attrs){
    if(attrs&&d.isConnected){
      var old=d.querySelector('.pc-attrs');if(old)old.remove();
      renderCardAttrs(d,attrs);
    }
    it._attrsRich=isAttrsRich(attrs);
    applyFilters();
    reflowGrid(); /* "정원 관련 식물 우선순위" - 용도/색상 등 정원 정보가 실제로 채워지면 순위 상승 */
  });
}
function attrChipsHtml(attrs,small){
  var chips=[];
  if(attrs.sunlight)chips.push('<span class="attr-chip">'+esc(attrs.sunlight)+'</span>');
  if(attrs.cycle)chips.push('<span class="attr-chip">'+esc(attrs.cycle)+'</span>');
  attrs.colors.slice(0,small?2:6).forEach(function(c){
    chips.push('<span class="attr-chip"><span class="attr-dot" style="background:'+colorSwatch(c)+'"></span>'+esc(c)+'</span>');
  });
  return chips.join('');
}
function renderCardAttrs(cardEl,attrs){
  var body=cardEl.querySelector('.pc-body');
  var html=attrChipsHtml(attrs,true);
  if(body&&html){
    var wrap=document.createElement('div');
    wrap.className='pc-attrs';
    wrap.innerHTML=html;
    body.appendChild(wrap);
  }
}
/* 농사로 gardenList에서 이름으로 관리난이도 등을 찾을 때 쓰는 헬퍼(비교표에서 사용). */
function nongsaroGardenByName(korNm){
  if(!korNm||!NONGSARO_GARDEN_CANDIDATES)return null;
  for(var i=0;i<NONGSARO_GARDEN_CANDIDATES.length;i++){
    if(NONGSARO_GARDEN_CANDIDATES[i].cntntsSj===korNm)return NONGSARO_GARDEN_CANDIDATES[i];
  }
  return null;
}
/* ---- 정원 정보 필터 (상시 노출 패널, 다중 패싯, 복수 선택) ----
   기존 드롭다운(버튼을 눌러야 열리는 패널)은 필터가 있다는 사실 자체를
   가리는 문제가 있었다 - "정원식물/자생식물/보라색꽃"처럼 사용자가 바로
   눈으로 보고 고를 수 있어야 활용도가 높아지므로, 패널을 상시 노출하고
   패싯을 用途(식물 유형)·출처 분류·꽃 색상(시각적 스와치)·생활형·광조건
   다섯 갈래로 나누었다. 모든 패싯은 각각 복수 선택(OR)이며, 패싯 간에는
   AND로 좁혀진다. */
var pFilter={usecat:[],origin:[],color:[],cycle:[],light:[],story:[]};
/* 클릭 반응 속도 최적화: 예전엔 칩 하나를 눌러도 5개 패싯(약 33개 칩) 전체를
   innerHTML로 다시 그렸다 - 브라우저가 매번 그 많은 DOM을 새로 만들고 클릭
   핸들러 문자열을 다시 파싱해야 해서 불필요하게 느렸다. 이제 클릭된 칩
   자신의 active 클래스만 토글하고, 카드 표시/숨김(applyFilters)만 즉시
   실행한다 - 나머지 칩들은 건드리지 않으므로 체감 속도가 즉각적이다. */
/* 검색창에 검색어가 없으면(pQ) 필터 자체가 하나의 검색 방식이 된다 - 정적
   데이터셋 전체에서 조건에 맞는 종을 새로 찾는다(runFacetSearch). 검색어로
   이미 결과를 받아온 상태라면 기존처럼 그 결과 안에서만 추린다(applyFilters). */
window.pToggleFilterVal=function(kind,v,el){
  var arr=pFilter[kind];
  var i=arr.indexOf(v);
  if(i===-1)arr.push(v);else arr.splice(i,1);
  if(el)el.classList.toggle('active');else renderFilterPanel();
  updateFilterBadge();
  if(pQ)applyFilters();else runFacetSearch();
};
window.pResetFilters=function(){
  pFilter={usecat:[],origin:[],color:[],cycle:[],light:[],story:[]};
  renderFilterPanel();
  updateFilterBadge();
  if(pQ)applyFilters();else runFacetSearch();
};
var USECAT_OPTS=['꽃나무/관목','상록침엽수','상록활엽수','낙엽교목','정원용초본(꽃/야생화)','꽃구근','과수/유실수','특용/약용수','잔디','씨앗','관엽/공기정화식물','생울타리','덩굴식물','수생식물','남부수종','희귀식물'];
var ORIGIN_OPTS=['자생식물','특산식물','적색식물','외래식물','민속식물'];
/* 국명/학명의 유래가 정리되어 있는(=이야기 탭에 보여줄 서술이 있는) 종만
   골라 보고 싶다는 요청에 따른 필터. 옵션이 하나뿐이라 다른 패싯처럼
   목록에서 값을 고르는 게 아니라 켜고 끄는 토글이지만, pFilter/chip/
   pToggleFilterVal 구조를 그대로 재사용할 수 있어 별도 코드 경로 없이
   'story' 라는 kind 하나만 추가했다. */
var STORY_OPTS=['스토리 있음'];
function renderFilterPanel(){
  var usecatEl=document.getElementById('pfusecat'),originEl=document.getElementById('pforigin'),
      colorEl=document.getElementById('pfcolor'),cycleEl=document.getElementById('pfcycle'),lightEl=document.getElementById('pflight'),
      storyEl=document.getElementById('pfstory');
  if(!usecatEl||!originEl||!colorEl||!cycleEl||!lightEl||!storyEl)return;
  var cycleOpts=['한해살이','두해살이','여러해살이','목본'],lightOpts=['양지','반음지','음지'];
  function chip(kind,o){return '<span class="fchip'+(pFilter[kind].indexOf(o)!==-1?' active':'')+'" onclick="pToggleFilterVal(\''+kind+'\',\''+o+'\',this)">'+esc(o)+'</span>';}
  usecatEl.innerHTML=USECAT_OPTS.map(function(o){return chip('usecat',o);}).join('');
  originEl.innerHTML=ORIGIN_OPTS.map(function(o){return chip('origin',o);}).join('');
  cycleEl.innerHTML=cycleOpts.map(function(o){return chip('cycle',o);}).join('');
  lightEl.innerHTML=lightOpts.map(function(o){return chip('light',o);}).join('');
  storyEl.innerHTML=STORY_OPTS.map(function(o){return chip('story',o);}).join('');
  colorEl.innerHTML=COLOR_MAP.map(function(c){return c.label;}).map(function(o){
    var active=pFilter.color.indexOf(o)!==-1;
    return '<button type="button" class="cchip'+(active?' active':'')+'" onclick="pToggleFilterVal(\'color\',\''+o+'\',this)" title="'+o+'">'
      +'<span class="cdot" style="background:'+colorSwatch(o)+'"></span><span class="clabel">'+esc(o)+'</span></button>';
  }).join('');
}
function updateFilterBadge(){
  var badge=document.getElementById('pfilterbadge'),reset=document.getElementById('pfilterreset');
  if(!badge||!reset)return;
  var n=pFilter.usecat.length+pFilter.origin.length+pFilter.color.length+pFilter.cycle.length+pFilter.light.length+pFilter.story.length;
  badge.textContent=n;
  reset.style.display=n?'inline-block':'none';
}
/* 종의 '출처 분류'(자생/특산/적색/외래/민속)는 배지 출처(origin)로 즉시 판정
   가능하지만, '자생식물'만은 별도 배지가 없어 dstrb 텍스트에서 추출한
   curationTags를 통해서만 알 수 있다(비동기, 카드별 정원정보 분석 완료 후). */
function originCategoryMatch(card,attrs,label){
  if(label==='자생식물')return !!(attrs&&attrs.tags&&attrs.tags.indexOf('자생식물')!==-1);
  /* 특산식물/적색식물은 목록 출처(spclt/rare API) 배지 외에, 국가표준식물목록의
     특산종_코드/멸종위기종 코드가 직접 '1'인 경우도 함께 인정한다 - 별도 목록
     API에는 없지만 국립수목원이 이미 평가해둔 종까지 커버리지를 넓히기 위함. */
  if(label==='특산식물'&&attrs&&attrs.endemicFlag)return true;
  if(label==='적색식물'&&attrs&&attrs.endgFlag)return true;
  var origin=card.getAttribute('data-origin'),key=null;
  for(var k in BADGE_LABEL){if(BADGE_LABEL[k]===label){key=k;break;}}
  return !!(key&&origin===key);
}
/* '식물 유형' 패싯도 마찬가지로 일부(씨앗·희귀식물)는 출처(origin)만으로 즉시
   판정되고, 나머지는 deriveUseCategory가 만든 attrs.useCats에서 판정된다.
   희귀식물_코드가 직접 '1'인 경우도 함께 인정한다. */
function cardHasUseCat(card,attrs,label){
  var origin=card.getAttribute('data-origin');
  if(ORIGIN_USECAT[origin]===label)return true;
  if(label==='희귀식물'&&attrs&&attrs.rareFlag)return true;
  return !!(attrs&&attrs.useCats&&attrs.useCats.indexOf(label)!==-1);
}
function updateFilterProgress(){
  var el=document.getElementById('pfilterprogress');
  if(!el)return;
  /* 도감 항목(data-no)뿐 아니라 "정원 정보로 찾기"로 나온 정적 데이터 항목
     (data-origin="static")도 분류 진행률에 포함한다 - 후자는 정적 데이터라
     네트워크 지연 없이 사실상 즉시 채워진다. */
  var cards=document.querySelectorAll('#pgrid .pc[data-no], #pgrid .pc[data-origin="static"]');
  var total=cards.length,done=0;
  cards.forEach(function(c){
    var no=c.getAttribute('data-no'),uid=c.getAttribute('data-uid');
    if(pAttrCache[no||('u'+uid)])done++;
  });
  if(!total){el.textContent='분류 가능한 도감 항목이 없습니다.';return;}
  el.textContent=(done<total)?('정원 정보 분석 중… ('+done+'/'+total+')'):('정원 정보 분석 완료 ('+total+'개)');
}
/* 필터 영역은 검색결과 유무와 무관하게 항상 노출되는 상시 UI다(사용자 요청).
   예전에는 검색 결과에 도감(no) 항목이 하나라도 있을 때만 보였는데, 결과가
   바뀔 때마다 패널이 나타났다 사라졌다 하는 것 자체가 어색하다는 피드백. */
function showFilterBarIfNeeded(){ /* 상시 노출 - 더 이상 조건부로 숨기지 않음. 호출부 호환을 위해 함수만 유지 */ }
function applyFilters(){
  var cards=document.querySelectorAll('#pgrid .pc');
  cards.forEach(function(card){
    var no=card.getAttribute('data-no'),uid=card.getAttribute('data-uid');
    var attrs=pAttrCache[no||('u'+uid)];
    var show=true;
    if(pFilter.usecat.length)show=show&&pFilter.usecat.some(function(v){return cardHasUseCat(card,attrs,v);});
    if(pFilter.origin.length)show=show&&pFilter.origin.some(function(v){return originCategoryMatch(card,attrs,v);});
    if(pFilter.color.length)show=show&&(attrs?pFilter.color.some(function(v){return attrs.colors&&attrs.colors.indexOf(v)!==-1;}):true);
    if(pFilter.light.length)show=show&&(attrs?pFilter.light.some(function(v){return (attrs.light||'').indexOf(v)!==-1;}):true);
    if(pFilter.cycle.length)show=show&&(attrs?pFilter.cycle.some(function(v){return (attrs.cycle||'').indexOf(v)!==-1;}):true);
    if(pFilter.story.length)show=show&&!!(attrs&&attrs.hasStory);
    card.style.display=show?'':'none';
  });
  updateFilterProgress();
}

/* ---- 정원 정보로 찾기(검색어 없이 필터만으로 종을 찾는 기능) ----
   원래 필터는 "이미 검색된 결과 안에서" 추리는 용도뿐이었다 - 이 API 자체가
   국명/학명 외에는 검색을 지원하지 않기 때문. 그런데 이제 정적 데이터셋(국가
   표준식물목록 3.6만종 + 상세설명 5,400여종)을 클라이언트에 들고 있으므로,
   검색창에 아무것도 입력하지 않아도 이 정적 데이터셋 전체를 대상으로 필터
   조건에 맞는 종을 직접 찾아 보여줄 수 있다. 정적 데이터에 없는 개념(민속식물/
   종자정보 등 목록 API 전용 배지)은 이 모드에서는 자연히 매치되지 않는다. */
var STATIC_INDEX=null;
function buildStaticIndex(){
  if(STATIC_INDEX)return STATIC_INDEX;
  var keys={};
  Object.keys(STATIC_SPECIES).forEach(function(k){keys[k]=1;});
  Object.keys(STATIC_NAME).forEach(function(k){keys[k]=1;});
  STATIC_INDEX=Object.keys(keys).map(function(k){
    var sp=STATIC_SPECIES[k],nm=STATIC_NAME[k];
    var korNm=(sp&&sp.kn)||(nm&&nm.kn)||k;
    var sc=(sp&&sp.sc)||(nm&&nm.sc)||k;
    /* item을 그냥 {}로 넘기면 deriveUseCategory 안의 val(item,'plantGnrlNm')이
       항상 빈 문자열이 되어, "들잔디/금잔디"처럼 국명 자체에 '잔디'가 들어간
       종이 잔디 카테고리로 하나도 분류되지 않는 문제가 있었다(실측: 잔디 칩을
       눌러도 결과 0건). 국명을 plantGnrlNm 자리에 채워 넘겨 이름 기반 분류가
       정상 동작하게 한다. */
    var attrs=deriveCuratedProfile({plantGnrlNm:korNm},{species:sp||null,name:nm||null},sc);
    return {
      key:k,
      nm:korNm,
      sc:sc,
      fam:(nm&&nm.family)||'',
      resType:(nm&&nm.resType)||'',
      attrs:attrs
    };
  });
  return STATIC_INDEX;
}
function staticEntryMatchesFilters(entry){
  var attrs=entry.attrs;
  if(pFilter.usecat.length&&!pFilter.usecat.some(function(v){
    return (attrs.useCats||[]).indexOf(v)!==-1||(v==='희귀식물'&&attrs.rareFlag);
  }))return false;
  if(pFilter.origin.length&&!pFilter.origin.some(function(v){
    if(v==='자생식물')return attrs.tags&&attrs.tags.indexOf('자생식물')!==-1;
    if(v==='특산식물')return !!attrs.endemicFlag;
    if(v==='적색식물')return !!attrs.endgFlag;
    if(v==='외래식물')return entry.resType==='외국종';
    return false; /* 민속식물 등은 정적 데이터셋에 대응 개념이 없어 매치되지 않음 */
  }))return false;
  if(pFilter.color.length&&!pFilter.color.some(function(v){return attrs.colors&&attrs.colors.indexOf(v)!==-1;}))return false;
  if(pFilter.cycle.length&&!pFilter.cycle.some(function(v){return (attrs.cycle||'').indexOf(v)!==-1;}))return false;
  if(pFilter.light.length&&!pFilter.light.some(function(v){return (attrs.light||'').indexOf(v)!==-1;}))return false;
  if(pFilter.story.length&&!attrs.hasStory)return false;
  return true;
}
function anyFilterActive(){
  return pFilter.usecat.length||pFilter.origin.length||pFilter.color.length||pFilter.cycle.length||pFilter.light.length||pFilter.story.length;
}
var facetSearchToken=0;
function runFacetSearch(){
  if(!anyFilterActive()){
    /* 필터를 모두 해제했고 검색어도 없으면 최초 안내 화면으로 되돌아간다. */
    hideLoading();hideAll();
    document.getElementById('pinit').style.display='block';
    document.getElementById('pcnt').style.display='none';
    return;
  }
  var myToken=++facetSearchToken;
  showLoading();
  curationDataReady.then(function(){
    if(myToken!==facetSearchToken)return; /* 그 사이 필터가 또 바뀌었으면 이 결과는 버림 */
    buildStaticIndex();
    var matches=STATIC_INDEX.filter(staticEntryMatchesFilters)
      .sort(function(a,b){ /* 내용이 풍부한(종 상세정보가 있는) 항목을 우선 노출, 그 다음 가나다순 */
        var d=rankOf({origin:'static',sc:b.sc})-rankOf({origin:'static',sc:a.sc});
        if(d)return d;
        return a.nm.localeCompare(b.nm,'ko');
      })
      .map(function(e){
        return {nm:e.nm,sc:e.sc,fam:e.fam,no:'',specsId:'',origin:'static',_uid:++pCardUid};
      });
    pAll=matches;pShown=0;pQ='';
    hideLoading();hideAll();
    if(!matches.length){
      document.getElementById('pemp').style.display='block';
      document.getElementById('pcnt').style.display='none';
      return;
    }
    renderPage();
  });
}

/* ---- 동시 요청 수 제한 ----
   카드 20개가 한꺼번에 사진+정원정보 요청을 쏘면 브라우저 동시 연결 한도에
   걸려 오히려 전체적으로 느려지고 응답이 뒤섞여 보인다. 한 번에 5개까지만
   진행하도록 제한해, 화면이 순차적으로 빠르게 채워지도록 한다. */
function makeLimiter(max){
  var active=0,queue=[];
  function next(){
    if(active>=max||!queue.length)return;
    active++;
    var job=queue.shift();
    job.fn().then(job.resolve,job.reject).then(function(){active--;next();});
  }
  return function(fn){
    return new Promise(function(resolve,reject){
      queue.push({fn:fn,resolve:resolve,reject:reject});
      next();
    });
  };
}
var limitCard=makeLimiter(5);

/* ---- 검색어 최적화 (Search Query Optimizer, JS 규칙 기반) ----
   외부 LLM 호출 없이 오타 교정/자연어 정리/유의어 확장의 취지만 차용해 구현.
   원본 프롬프트의 typeCd·api_path 같은 필드는 이 API에 그런 개념(재해유형,
   파일목록 등)이 없어 의미가 없으므로, 식물 API 구조(reqSearchWrd 검색어)에
   맞게 q_title/tokens 두 가지만 재매핑함. */
/* "흔히 표기하는 식물명" 대응 - 외래어 표기가 사람마다 갈리는 원예종 이름
   위주로, 아주 잘 알려진 경우만 보수적으로 추가한다(불확실한 것까지 넣으면
   서로 다른 식물을 잘못 연결할 위험이 있어, 확실한 표기 차이만 다룬다). */
var TYPO_MAP={
  '정온전문가':'정원전문가','속근초':'숙근초',
  '라벤다':'라벤더','제라니움':'제라늄','카네이숀':'카네이션','스투키아':'스투키'
  /* 자주 틀리는 표현이 있으면 여기에 "오타":"정답" 형태로 추가 */
};
var TRAIL_PATTERNS=[
  /\s*(좀\s*)?(알려\s*주세요|알려\s*줘|찾아\s*주세요|찾아\s*줘|보여\s*주세요|보여\s*줘|검색해\s*주세요|검색해\s*줘|추천해\s*주세요|추천해\s*줘|궁금합니다|궁금해요|궁금해|뭔가요|무엇인가요|뭐야|뭐에요|알고\s*싶어요|알고\s*싶어)\s*[.?!~]*$/
];
/* 이 API는 이름(국명/학명) 검색만 지원하고 '배수성 좋은 흙' 같은 속성/전문 텍스트
   검색은 지원하지 않으므로, 유의어는 결과에 자동 반영하지 않고 검색창 아래
   추천 검색어 칩으로만 제시해 사용자가 직접 선택하게 한다. */
var SYN_MAP=[
  {test:/그늘|응달|음지|햇빛.{0,4}안|해.{0,4}안\s*드는/, tokens:['음지식물','내음성']},
  {test:/물\s*빠짐|배수/, tokens:['배수성','마사토']},
  {test:/겨울.{0,6}(안\s*죽|살아남|월동)|매년\s*피는|해마다\s*피는/, tokens:['숙근초','내한성']},
  {test:/향기|향\s*좋은|냄새\s*좋은/, tokens:['방향식물']},
  {test:/공기\s*정화|미세먼지/, tokens:['공기정화식물']}
];

function optimizeQuery(raw){
  var orig=raw;
  var s=raw.trim().replace(/\s+/g,' ');
  var isErr=false;
  Object.keys(TYPO_MAP).forEach(function(k){
    if(s.indexOf(k)!==-1){s=s.split(k).join(TYPO_MAP[k]);isErr=true;}
  });
  var before=s;
  TRAIL_PATTERNS.forEach(function(re){s=s.replace(re,'').trim();});
  if(s!==before)isErr=true;
  var tokens=[];
  SYN_MAP.some(function(rule){
    if(rule.test.test(before)){tokens=rule.tokens.slice(0,3);return true;}
    return false;
  });
  if(!s)s=orig.trim();
  return {orig:orig,corr:s,is_err:(isErr||orig.trim()!==s),q_title:s,tokens:tokens};
}

/* 검색창 오른쪽의 "×" 지우기 버튼 - 검색어가 있을 때만 보인다. 프로그램적으로
   값을 채울 때(pSuggest 등)도 함께 호출해 항상 실제 입력값과 표시가 일치하게
   한다. */
function pUpdateClearBtn(){
  var el=document.getElementById('psi'),btn=document.getElementById('pclearbtn');
  if(!el||!btn)return;
  btn.style.display=el.value.trim()?'flex':'none';
}
window.pOnSearchInput=function(){
  pUpdateClearBtn();
  var el=document.getElementById('psi');
  if(el&&!el.value.trim())pClearedSearch();
};
/* "×" 버튼 또는 검색어를 손으로 지웠을 때 공통으로 타는 경로 - 새로 검색하고
   싶을 때는 이 버튼 한 번으로 검색어만 깔끔히 비우고, 선택해둔 필터는 그대로
   남겨서 바로 "정원 정보로 찾기" 결과를 보여준다. */
window.pClearSearchBox=function(){
  var el=document.getElementById('psi');
  if(el)el.value='';
  pUpdateClearBtn();
  pClearedSearch();
};
window.pSuggest=function(term){
  var el=document.getElementById('psi');
  if(el)el.value=term;
  pUpdateClearBtn();
  pQ=term;
  runSearch();
};

window.pSearch=function(){
  var raw=(document.getElementById('psi')||{value:''}).value;
  if(!raw||!raw.trim())return;
  var opt=optimizeQuery(raw);
  window.__lastQueryOpt=opt; /* 디버그/검증용 */
  var noteEl=document.getElementById('pnote');
  var suggEl=document.getElementById('psugg');
  if(opt.is_err&&opt.corr){
    var el=document.getElementById('psi');if(el)el.value=opt.corr;
    noteEl.textContent="'"+opt.orig+"' → '"+opt.corr+"'(으)로 교정하여 검색했습니다.";
    noteEl.style.display='block';
  } else {
    noteEl.style.display='none';
  }
  if(opt.tokens.length){
    suggEl.innerHTML=opt.tokens.map(function(t){return '<span class="pchip" onclick="pSuggest(\''+t.replace(/'/g,"")+'\')">'+esc(t)+'</span>';}).join('');
    suggEl.style.display='flex';
  } else {
    suggEl.style.display='none';
  }
  pQ=opt.q_title;
  pUpdateClearBtn();
  runSearch();
};
window.pMore=function(){
  var b=document.getElementById('pmorebtn');if(b)b.textContent='불러오는 중...';
  renderPage();
};
/* 검색창을 손으로(또는 "×" 버튼으로) 비웠을 때의 동작 - "초기화 방식"을
   다시 정리했다: 선택된 필터가 남아 있으면 그 필터만으로 찾은 결과("정원
   정보로 찾기")를 바로 보여주고, 필터도 전혀 없으면 이전 검색 결과를 화면에
   그대로 남겨두지 않고 맨 처음 안내 화면으로 되돌아간다(예전엔 검색어만
   지우고 필터도 없으면 아무 반응이 없어, 지운 게 맞는지 헷갈렸다). */
window.pClearedSearch=function(){
  pQ='';
  if(anyFilterActive()){
    runFacetSearch();
  } else {
    hideLoading();hideAll();
    document.getElementById('pinit').style.display='block';
    document.getElementById('pcnt').style.display='none';
  }
};

/* 식물도감(정식 도감 항목)과 식물표본(표본관 채집기록) 두 목록을 함께 조회해 합치면,
   도감에는 없지만 표본으로만 등록된 종까지 검색 결과에 포함되어 누락이 크게 줄어든다.
   numOfRows는 100에서 50으로 낮춰 정부 API 응답 속도를 조금 더 확보했다(실측상
   대부분의 검색어는 결과가 50건을 넘지 않아 누락 문제는 재발하지 않는다). */
function fetchSourceItems(path,q){
  var cacheKey='src|'+path+'|'+q;
  var cached=cacheGet(cacheKey,SEARCH_CACHE_TTL);
  if(cached!==undefined)return Promise.resolve(cached);
  var url=buildUrl(path,{serviceKey:KEY,pageNo:1,numOfRows:50,reqSearchWrd:q});
  return fetchJson(url).then(function(data){
    var res=(data&&data.response)||{};
    var header=res.header||{};
    var body=res.body||{};
    var items;
    if(header.resultCode==='03')items=[];
    else if(header.resultCode!=='00')throw new Error(header.resultMsg||'조회 중 오류가 발생했습니다.');
    else if(!parseInt(body.totalCount||0,10))items=[];
    else items=normalizeItems(body.items);
    cacheSet(cacheKey,items); /* 결과가 0건인 것도 유효한 응답이므로 함께 캐시한다 */
    return items;
  }).catch(function(e){return {__err:e};});
}

/* "은행" ↔ "은행나무", "무궁화" ↔ "무궁화나무"처럼 나무는 "나무"를 붙이거나
   뗀 채로 흔히 검색된다. 어떤 이름을 어떤 이름으로 바꿀지 종별로 추측하는
   게 아니라, 기계적으로 접미사만 붙이고 떼는 안전한 변형이라 서로 다른
   종을 혼동시킬 위험이 없다("우리나라에서 흔히 표기하는 식물명" 대응). */
function nameVariant(q){
  var t=(q||'').trim();
  if(!t)return null;
  if(/나무$/.test(t)){var stripped=t.slice(0,-2).trim();return stripped||null;}
  return t+'나무';
}
/* 원본 검색어와 함께 나무 접미사 변형도 같은 오퍼레이션에 요청해 합친다.
   원본 쿼리 자체가 실패하면(정부 API 오류 등) 기존과 동일하게 에러로
   전달하고, 변형 쿼리만 실패하면 조용히 무시한다(원본 결과는 살아있어야
   하므로). */
function fetchSourceItemsWithVariant(path,q){
  var variant=nameVariant(q);
  if(!variant||variant===q)return fetchSourceItems(path,q);
  return Promise.all([fetchSourceItems(path,q),fetchSourceItems(path,variant)]).then(function(res){
    var a=res[0],b=res[1];
    if(!Array.isArray(a))return a;
    return a.concat(Array.isArray(b)?b:[]);
  });
}
/* 정부 API의 reqSearchWrd는 국명/학명만 매칭하고 과명(예: "장미과")으로는
   검색되지 않는다(실측 확인: "장미과"로 조회하면 0건). 이미 불러온 정적
   식물목록(국가표준식물목록)에는 과명이 있으므로, "○○과" 형태로 끝나는
   검색어일 때만 그 목록에서 과명이 정확히 일치하는 종을 찾아 보충한다.
   "○○과"로 끝나지 않는 일반 검색어는 실제 종명이 우연히 과명과 겹칠 일이
   없으므로 건드리지 않는다. */
function familyMatches(fam,q){
  if(!fam)return false;
  var f=fam.trim().replace(/과$/,''),qn=q.trim().replace(/과$/,'');
  return !!f&&f===qn;
}
function searchByFamily(q){
  if(!/과$/.test((q||'').trim()))return Promise.resolve([]);
  return staticDataReady.then(function(){
    buildStaticIndex();
    var matches=STATIC_INDEX.filter(function(e){return familyMatches(e.fam,q);});
    return matches.slice(0,80).map(function(e){
      return {nm:e.nm,sc:e.sc,fam:e.fam,no:'',specsId:'',origin:'static',_uid:++pCardUid};
    });
  }).catch(function(){return [];});
}

/* iNaturalist는 국명 색인이 얇고 동물·곤충·균류 등과 이름이 겹치는 경우가 많아
   (예: "장미"로 앵무새·나방까지 매칭) 검색 확장 소스로 그대로 쓰면 오탐이 생긴다.
   그래서 '식물계(iconic_taxon_name===Plantae)'이고 '종/아종/변종' 랭크인 결과만
   채택해 노이즈를 걸러내고, 도감·표본에 전혀 없는 종만 보충용으로 추가한다. */
function fetchINatMatches(q){
  var cacheKey='inat|'+q;
  var cached=cacheGet(cacheKey,SEARCH_CACHE_TTL);
  if(cached!==undefined)return Promise.resolve(cached);
  var url='https://api.inaturalist.org/v1/taxa?q='+encodeURIComponent(q)+'&locale=ko&per_page=20';
  return fetch(url).then(function(r){return r.ok?r.json():null;}).then(function(j){
    var results=(j&&j.results)||[];
    var out=results.filter(function(t){
      return t.iconic_taxon_name==='Plantae'&&/^(species|subspecies|variety)$/.test(t.rank);
    }).map(function(t){
      return {nm:t.preferred_common_name||t.name,sc:t.name,fam:'',no:'',specsId:'',origin:'inat'};
    });
    cacheSet(cacheKey,out);
    return out;
  }).catch(function(){return [];});
}

var pCardUid=0;
/* 도감/표본 외에 같은 API(산림청 국립수목원_식물자원 조회 서비스) 안에 있던
   특산식물·적색식물·외래식물·민속식물·종자정보 5개 오퍼레이션은 그동안 전혀
   쓰이지 않아 해당 종들이 검색에서 통째로 빠져 있었다(사용자 확인: "상당부분
   반영 안되는거 같아"). 필드명이 살짝씩 다르지만(예: familyKorNm vs
   apgFamilyKorNm 표기 흔들림) 국명/학명 필드는 공통이라 같은 방식으로 매핑하고,
   원본 필드는 raw에 그대로 보관해 상세팝업에서 재사용한다. */
var STRUCT_ORIGINS={spclt:1,rare:1,naturalized:1,folk:1,seed:1};
function toObj(raw,origin){
  var uid=++pCardUid;
  if(origin==='inat')return{nm:raw.nm,sc:raw.sc,fam:raw.fam,no:'',specsId:'',origin:'inat',_uid:uid};
  if(STRUCT_ORIGINS[origin])return{
    nm:val(raw,'plantGnrlNm')||'이름 없음',
    sc:val(raw,'plantSpecsScnm')||'',
    fam:val(raw,'familyKorNm')||val(raw,'apgFamilyKorNm')||val(raw,'agpFamilyKorNm')||'',
    no:'',specsId:'',
    origin:origin,
    raw:raw,
    _uid:uid
  };
  return{
    nm:val(raw,'plantGnrlNm')||'이름 없음',
    sc:val(raw,'plantSpecsScnm')||'',
    fam:val(raw,'familyKorNm')||val(raw,'apgFamilyKorNm')||'',
    no:val(raw,'plantPilbkNo')||'',
    specsId:val(raw,'plantSpecsId')||'',
    origin:'gov',
    _uid:uid
  };
}
/* 같은 종을 가리키는 항목인지 판단하는 기준은 국명이 아니라 학명이 최우선이다
   (국명은 표기 흔들림/이명이 많지만 학명은 종을 정확히 특정한다). 저자 인용을
   뗀 학명(cleanSciName)으로 비교해 여러 소스가 같은 종을 다르게 표기해도
   (예: 저자 인용 유무) 같은 항목으로 인식한다. */
function dedupKey(obj){
  var sc=cleanSciName(obj.sc||'').trim().toLowerCase();
  return sc||obj.nm.trim().toLowerCase();
}
/* 콘텐츠 충실도 순위: 도감 상세(no, 형태·분포 등 본문+정원정보 제공) > 표본
   기록(specsId, 소장기관·채집지만 제공) > 특산/적색/외래/민속/종자(raw, 구조화된
   필드가 있음) > iNaturalist 단독(이름만 있음). 같은 종이 여러 소스에서 중복
   검색되면 이 순위가 더 높은 쪽만 카드로 남기고 낮은 쪽은 버린다
   ("이미지가 있고 내용이 있는 것을 사용"). */
function rankOf(o){
  if(o.origin==='static'){var m=getStaticMatch(o.sc);return (m&&m.species)?4:2;}
  return o.no?4:(o.specsId?3:(o.raw?2:1));
}

/* 국내 대표 조경수·유실수 종묘장(다일림종묘, dailimseed.co.kr)에서 실제로
   유통되는 식물의 국명 목록. "실제로 시중에서 사고파는, 사람들이 찾는 식물"을
   검색 결과에서 우선 노출하기 위한 참고 데이터로, 학명/사진 등 다른 신뢰도
   판단 기준을 대체하지 않고 아주 작은 가산점만 더한다(허브차 표기 흔들림 등
   과잉 매칭을 막기 위해 완전 일치만 인정 - "나무" 접미사 유무 차이만 흡수). */
var DAILIM_PLANT_NAMES=['감나무','블루베리','사과나무','사과','포포나무','대추나무','대추','체리나무','체리',
'왕다래','다래나무','다래','밤나무','단감나무','포도','서양측백','은청가문비','블루아이스','블루엔젤',
'빈카마이너','꽃범의꼬리','감국','속새','튜베로즈','코스모스','버들마편초','숙근버베나','워터코인','부들',
'물토란','엔사타아이리스','일본붓꽃','개쉬땅','목수국','미국수국','아나벨','무화과','자귀나무','배롱나무',
'여우꼬리보리사초','니포피아','숙근샐비어','백일홍','루드베키아','펜스테몬','유카','안젤로니아','베고니아',
'아스틸베','털부처꽃','에키네시아','수국','정원수국','꽃수국','붉나무','장미','클레마티스','라일락','분꽃',
'설구화','산수국','덩굴수국','떡갈잎수국','조팝','안개나무','자주받침꽃','고광','각시석남','귤나무','감귤',
'한라봉','천혜향','레드향','황금향','카라향','자두나무','자두','올리브나무','매실','석류','복숭아','호두',
'서양호두','페칸','살구','키위','양다래','오디','뽕나무','참가죽나무','참중나무','헛개','지구자','구기자',
'우산고로쇠','도라지','산마늘','명이나물','곰취','잔대','꾸지뽕','엄나무','음나무','두릅','돌배','쉬나무',
'오갈피','가시오갈피','오미자','초피','산초','옻나무','벌나무','산청목','고로쇠','두충','몽키퍼즐트리',
'아라우카리아','조선측백','황금측백','자작나무','실목련','벚나무','단풍나무','산딸나무','산수유','느티나무',
'꽃사과','해당화','메타세콰이어','버드나무','칠자화','계수나무','이팝나무','위성류','은행나무','회화나무',
'마가목','야생화','허브','라벤더','오레가노','제라늄','아게라텀','불로화','레몬밤','베토니','메리골드',
'코키아','억새','수크령','팜파스그라스','백합','수선화','알리움','크로커스','튤립','숙근도라지','샤프란',
'설강화','스노우드롭','치오노독사','설광화','무스카리','석산','상사화','히야신스','칸나','푸쉬키니아',
'금목서','은목서','피라칸사스','사철나무','청죽','오죽','대나무','동백','홍가시','황금사철','은사철',
'회양목','동청목','호주매화','조릿대','촛대초령목','치자','호랑가시','병솔꽃','꽝꽝나무','광나무',
'바위남천','뿔남천'];
var DAILIM_PLANT_SET=(function(){
  var s={};
  DAILIM_PLANT_NAMES.forEach(function(n){
    s[n]=1;
    var stripped=n.replace(/나무$/,'');
    if(stripped)s[stripped]=1;
  });
  return s;
})();
function isDailimPlant(nm){
  if(!nm)return false;
  var t=nm.trim();
  if(!t)return false;
  if(DAILIM_PLANT_SET[t])return true;
  var stripped=t.replace(/나무$/,'');
  return stripped!==t&&!!DAILIM_PLANT_SET[stripped];
}
/* 검색어와 국명/학명이 얼마나 가깝게 일치하는지 점수화한다("국문명 검색이
   잘 안 된다"는 지적의 실제 원인 - 예전엔 displayScore가 오직 사진/콘텐츠
   충실도만 봐서, "소나무"를 검색하면 정작 소나무 자신은 뒤로 밀리고 사진이
   많은 "구주소나무"/"리기다소나무" 같은 합성명 결과가 앞에 뜨는 일이 있었다).
   완전 일치 > 접두 일치 > 부분 포함 순으로 점수를 매기고, 국명이 안 맞으면
   학명도 같은 방식으로 확인한다. */
function queryMatchScore(it,q){
  if(!q)return 0;
  var qn=q.trim();
  if(!qn)return 0;
  var nm=(it.nm||'').trim();
  if(nm){
    if(nm===qn)return 3;
    if(nm.indexOf(qn)===0)return 2;
    if(nm.indexOf(qn)!==-1)return 1;
  }
  var sc=(it.sc||'').toLowerCase();
  var qs=qn.toLowerCase();
  if(sc){
    if(sc===qs)return 3;
    if(sc.indexOf(qs)===0)return 2;
    if(sc.indexOf(qs)!==-1)return 1;
  }
  return 0;
}
/* 화면 표시 순서 전용 점수: "사진+내용이 풍부한 순, 정원 관련 식물 우선순위"
   요청에 따라 (1)사진 유무를 가장 크게 반영하고 (2)rankOf의 콘텐츠 충실도를
   보조 기준으로, (3)정원 정보(용도/색상/생활형 태그)가 실제로 채워졌는지를
   작은 가산점으로 반영한다. 사진/속성은 카드가 그려진 뒤 비동기로 도착하므로
   아직 모르는 상태(undefined)는 "중간값"으로 취급해 결과가 도착하기 전에
   맨 아래로 밀려나는 것을 막는다.
   검색어가 있는 경우에는(pQ) 검색어 일치도가 무조건 콘텐츠 충실도보다
   우선한다(×10 가중치 - 콘텐츠 점수의 최댓값 3.5보다 한 단계 차이만 나도
   항상 앞서도록) - 정확히 입력한 이름이 사진 많은 다른 종에 밀려 안 보이는
   일을 막기 위함. 마지막으로 실제 종묘장에서 유통되는 종(DAILIM_PLANT_SET)이면
   아주 작은 가산점(0.3)을 더해 "실제로 구할 수 있는 식물"이 동률일 때 살짝
   앞서게 한다 - garden(0.5)보다는 작게, 다른 신뢰도 기준을 넘어서지 않도록. */
function displayScore(it){
  var rankNorm=(rankOf(it)-1)/3; /* 1~4 -> 0~1 */
  var photo=it._hasPhoto===true?2:(it._hasPhoto===false?0:1);
  var garden=it._attrsRich===true?0.5:0;
  var market=isDailimPlant(it.nm)?0.3:0;
  var match=pQ?queryMatchScore(it,pQ)*10:0;
  return match+photo+rankNorm+garden+market;
}
function isAttrsRich(attrs){return !!(attrs&&((attrs.tags&&attrs.tags.length)||(attrs.useCats&&attrs.useCats.length)));}
/* 이미 그려진 카드(사진 로딩 등)를 새로 만들지 않고, DOM에 붙어있는 노드를
   appendChild로 재배치만 해서 순서를 displayScore 기준으로 맞춘다. 사진/정원
   정보가 비동기로 속속 도착할 때마다 호출되므로, 카드를 새로 만들거나 이미
   불러온 사진을 다시 불러오지 않는다 - 순서만 바뀐다. */
function reflowGrid(){
  var g=document.getElementById('pgrid');
  if(!g)return;
  var shown=pAll.slice(0,pShown).filter(function(it){return pCardEls[it._uid];});
  shown.sort(function(a,b){
    var d=displayScore(b)-displayScore(a);
    if(d)return d;
    return a.nm.localeCompare(b.nm,'ko');
  });
  shown.forEach(function(it){g.appendChild(pCardEls[it._uid].el);});
}

/* 새로 도착한 소스의 결과를 기존 목록에 중복 없이 이어붙인다. 실측 결과
   plantPilbkSearch/plantSmplSearch 정부 API 자체가 건당 1~3초 이상 걸리는
   경우가 흔해(정부 서버 쪽 지연, 우리 쪽에서 줄일 수 없는 부분) 이 두 소스와
   iNaturalist 세 곳을 Promise.all로 묶어 "제일 느린 소스"를 기다리게 하지
   않고, 각 소스가 도착하는 즉시 독립적으로 화면에 반영한다. pAll 자체에는
   새로 들어온 묶음끼리만 정렬해 뒤에 붙이고(데이터 순서는 그대로 유지),
   "사진+내용이 풍부한 순으로 노출" 요구사항은 별도의 reflowGrid()가
   담당한다 - 카드를 새로 만들거나 다시 그리지 않고 이미 그려진 DOM 노드를
   displayScore 기준으로 재배치만 하므로, 사진 재요청 없이 순서만 바뀐다.
   중복(같은 학명) 항목이 나중에 도착했는데 그쪽이 더 내용이 충실하면(예: 먼저
   보여준 건 iNaturalist 단독 항목인데 나중에 도감 항목이 도착) 새 카드를 또
   만들지 않고 이미 그려진 카드를 그 자리에서 업그레이드한다(added가 아니라
   upgraded로 반환) — 화면엔 종마다 카드 한 장만 남는다. */
function appendItems(existing,rawList,origin){
  var newObjs=(rawList||[]).map(function(raw){return toObj(raw,origin);});
  newObjs.sort(function(a,b){return a.nm.localeCompare(b.nm,'ko');});
  var keyIndex={};
  existing.forEach(function(x,i){keyIndex[dedupKey(x)]=i;});
  var added=[],upgraded=[],upgradedSeen={};
  newObjs.forEach(function(obj){
    var key=dedupKey(obj);
    var idx=keyIndex[key];
    if(idx===undefined){
      keyIndex[key]=existing.length;
      existing.push(obj);
      added.push(obj);
      return;
    }
    var e=existing[idx];
    var beforeRank=rankOf(e);
    if(rankOf(obj)>beforeRank){
      e.nm=obj.nm;e.sc=obj.sc||e.sc;e.fam=obj.fam||e.fam;e.no=obj.no;e.specsId=obj.specsId||e.specsId;
      if(obj.raw)e.raw=obj.raw;
      e.origin=obj.origin;
    } else {
      if(!e.no&&obj.no)e.no=obj.no;
      if(!e.specsId&&obj.specsId)e.specsId=obj.specsId;
      if(!e.raw&&obj.raw)e.raw=obj.raw;
      if(e.origin==='inat'&&obj.origin!=='inat')e.origin=obj.origin;
    }
    if(rankOf(e)>beforeRank&&!upgradedSeen[e._uid]){upgradedSeen[e._uid]=true;upgraded.push(e);}
  });
  return {added:added,upgraded:upgraded};
}

/* 정부 API(같은 apis.data.go.kr 서비스) 계열 오리진 판정 - 이 중 하나라도
   정상 응답하면 "정부 API는 살아있다"로 보고, 전부 실패했을 때만 진짜 오류
   메시지를 보여준다(그 외엔 그냥 '검색결과 없음'으로 처리). */
function isGovOrigin(origin){return origin==='gov'||!!STRUCT_ORIGINS[origin];}

/* "필터를 먼저 고른 뒤 그 안에서 검색어로 찾고 싶다"는 요청에 따라, 검색어
   검색을 실행해도 이미 선택된 필터(자생식물 등)를 더 이상 조용히 초기화하지
   않는다 - 예전엔 여기서 pFilter를 매번 비워버려서, ①필터를 먼저 고르고
   ②이어서 검색어로 찾으면 필터가 티 안 나게 사라지고 전체 결과가 나오는
   게 가장 헷갈리는 지점이었다. 이제 검색 결과가 그려질 때(renderPage 안의
   renderFilterPanel/applyFilters)마다 현재 필터를 그대로 다시 적용해,
   "검색어+필터"가 항상 AND로 함께 좁혀지고 필터 칩의 활성 표시도 그대로
   유지된다. 필터만 지우고 싶으면 필터 패널의 "초기화" 버튼을 쓰면 된다. */
function runSearch(){
  showLoading();
  pAll=[];
  pShown=0;
  var myQuery=pQ;
  var firstShown=false;
  var pending=9;
  var govOk=false,govErr=null;

  function onSettled(){
    pending--;
    if(pending===0&&myQuery===pQ&&!pAll.length){
      hideLoading();hideAll();
      if(!govOk&&govErr){
        showError(govErr.message||'네트워크 오류가 발생했습니다.');
      } else {
        document.getElementById('pemp').style.display='block';
      }
    }
    updateLoadingNote();
  }
  function updateLoadingNote(){
    if(myQuery!==pQ)return;
    var el=document.getElementById('pcnttxt');
    if(!firstShown||!el)return;
    el.textContent='총 '+pAll.length.toLocaleString()+'건 중 '+pShown+'건 표시'+(pending>0?' · 추가 결과 불러오는 중…':'');
  }
  function onSource(promise,origin){
    promise.then(function(items){
      if(myQuery!==pQ)return;
      if(!Array.isArray(items)){
        if(isGovOrigin(origin))govErr=(items&&items.__err)||govErr;
        return; /* 이 소스만 실패, 다른 소스는 계속 진행 */
      }
      if(isGovOrigin(origin))govOk=true;
      var result=appendItems(pAll,items,origin);
      if(result.added.length){
        if(!firstShown){
          hideLoading();hideAll();
          document.getElementById('pcnt').style.display='flex';
          document.getElementById('pgrid').style.display='grid';
          firstShown=true;
        }
        renderPage();
      }
      result.upgraded.forEach(refreshCard);
    }).catch(function(){}).then(onSettled);
  }

  onSource(fetchSourceItemsWithVariant('/plantPilbkSearch',myQuery),'gov');
  onSource(fetchSourceItemsWithVariant('/plantSmplSearch',myQuery),'gov');
  onSource(fetchSourceItemsWithVariant('/plantSpcltList',myQuery),'spclt');
  onSource(fetchSourceItemsWithVariant('/plantRareList',myQuery),'rare');
  onSource(fetchSourceItemsWithVariant('/plantNaturalizedList',myQuery),'naturalized');
  onSource(fetchSourceItemsWithVariant('/plantFolkSearch',myQuery),'folk');
  onSource(fetchSourceItemsWithVariant('/plantSeedSearch',myQuery),'seed');
  onSource(fetchINatMatches(myQuery),'inat');
  onSource(searchByFamily(myQuery),'static');
}

var BADGE_LABEL={spclt:'특산식물',rare:'적색식물',naturalized:'외래식물',folk:'민속식물',seed:'종자정보'};
function badgeFor(it){
  if(it.no)return'';
  if(it.specsId)return'<span class="pc-tag">표본</span>';
  if(BADGE_LABEL[it.origin])return '<span class="pc-tag">'+BADGE_LABEL[it.origin]+'</span>';
  if(it.origin==='inat')return'<span class="pc-tag">생물다양성DB</span>';
  if(it.origin==='static')return'<span class="pc-tag">정원 정보</span>';
  return'';
}
function coreHtml(it){
  return '<p class="pc-name">'+esc(it.nm)+'</p><p class="pc-sci">'+esc(it.sc)+'</p>'+(it.fam?'<span class="pc-fam">'+esc(it.fam)+'</span>':'')+badgeFor(it);
}
/* uid -> 렌더된 카드 DOM 매핑. 같은 종의 더 충실한 항목이 나중에 도착하면(예:
   iNaturalist 단독 항목으로 먼저 그려졌다가 도감 항목으로 승급) 새 카드를
   추가하지 않고 이 매핑을 통해 이미 그려진 카드를 제자리에서 갱신한다. */
var pCardEls={};
function refreshCard(it){
  var rec=pCardEls[it._uid];
  if(!rec)return; /* 아직 화면에 그려지지 않은 항목이면(다음 페이지 분) pAll 갱신만으로 충분 */
  var d=rec.el;
  if(it.no)d.setAttribute('data-no',it.no); else d.removeAttribute('data-no');
  d.setAttribute('data-origin',it.origin||'');
  d.setAttribute('data-uid',it._uid);
  var core=d.querySelector('.pc-core');
  if(core)core.innerHTML=coreHtml(it);
  var imgWrap=d.querySelector('.pc-img');
  if(imgWrap&&!imgWrap.querySelector('img')){
    limitCard(function(){return loadCardImage(it.nm,it.sc,imgWrap,function(credit){ /* 승급으로 더 나은 이름/학명이 생겼으면 사진 재시도 */
      it._hasPhoto=!!credit;
      reflowGrid();
    });});
  }
  loadAndRenderAttrs(d,it);
  reflowGrid();
}

/* ---- 다중 선택 비교 뷰 ----
   조경전문가·가드너가 후보 몇 종을 놓고 스펙을 나란히 견줘보고 싶을 때를
   위한 기능("다중 선택 비교 뷰"). 카드마다 "비교" 버튼을 두어 최대 4종까지
   담을 수 있고, 담긴 종은 화면 하단 고정 바에 썸네일로 모여 보인다. 비교
   표는 이미 로드된 attrs(pAttrCache)와 카드에 이미 그려진 이미지를 그대로
   재사용해 새 네트워크 요청 없이 즉시 구성한다. */
var pCompareSet={};
var COMPARE_MAX=4;
function compareCount(){return Object.keys(pCompareSet).length;}
window.pToggleCompare=function(it,cardEl){
  var uid=String(it._uid);
  var btn=cardEl.querySelector('.pc-cmpbtn');
  if(pCompareSet[uid]){
    delete pCompareSet[uid];
    cardEl.classList.remove('pc-cmp-active');
    if(btn){btn.classList.remove('active');btn.textContent='비교';}
  } else {
    if(compareCount()>=COMPARE_MAX){
      alert('한 번에 최대 '+COMPARE_MAX+'개까지 비교할 수 있습니다.');
      return;
    }
    pCompareSet[uid]={it:it,el:cardEl};
    cardEl.classList.add('pc-cmp-active');
    if(btn){btn.classList.add('active');btn.textContent='비교중';}
  }
  renderCompareBar();
};
function renderCompareBar(){
  var bar=document.getElementById('pcmpbar');
  if(!bar)return;
  var n=compareCount();
  document.getElementById('pcmpcount').textContent=n;
  var go=document.getElementById('pcmpgo');
  go.disabled=n<2;
  bar.style.display=n?'flex':'none';
  var thumbs=document.getElementById('pcmpthumbs');
  thumbs.innerHTML=Object.keys(pCompareSet).map(function(uid){
    var rec=pCompareSet[uid];
    var img=rec.el.querySelector('.pc-img img');
    var src=img?img.src:'';
    return '<div style="position:relative;flex-shrink:0" title="'+esc(rec.it.nm)+'">'
      +(src?'<img src="'+src+'" style="width:40px;height:40px;object-fit:cover;display:block">':'<div style="width:40px;height:40px;background:#333;display:flex;align-items:center;justify-content:center"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#787878" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="1"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5-9 9"/></svg></div>')
      +'<span onclick="pRemoveCompare(\''+uid+'\')" style="position:absolute;top:-6px;right:-6px;width:16px;height:16px;border-radius:50%;background:#fff;color:#121212;font-size:10px;display:flex;align-items:center;justify-content:center;cursor:pointer">&#10005;</span>'
      +'</div>';
  }).join('');
}
window.pRemoveCompare=function(uid){
  var rec=pCompareSet[uid];
  if(rec)pToggleCompare(rec.it,rec.el);
};
window.pClearCompare=function(){
  Object.keys(pCompareSet).forEach(function(uid){
    var rec=pCompareSet[uid];
    rec.el.classList.remove('pc-cmp-active');
    var btn=rec.el.querySelector('.pc-cmpbtn');
    if(btn){btn.classList.remove('active');btn.textContent='비교';}
  });
  pCompareSet={};
  renderCompareBar();
};
/* 비교표에 넣을 항목 - 역할(가드너/조경/학술) 구분 없이, 세 역할 모두가
   후보를 비교할 때 공통으로 보고 싶어할 핵심 스펙을 한 표에 모은다. */
function compareRowsSpec(){
  return [
    ['국명',function(it){return it.nm;}],
    ['학명',function(it){return it.sc;}],
    ['과명',function(it,attrs,match){return (match&&match.name&&match.name.family)||it.fam||'-';}],
    ['자원구분',function(it,attrs){return (attrs&&attrs.resType)||'-';}],
    ['희귀·특산·멸종위기',function(it,attrs){
      if(!attrs)return '-';
      var f=[];
      if(attrs.endemicFlag)f.push('특산');
      if(attrs.rareFlag)f.push('희귀');
      if(attrs.endgFlag)f.push('멸종위기');
      return f.length?f.join(', '):'해당 없음';
    }],
    ['광조건',function(it,attrs){return (attrs&&attrs.sunlight)||'-';}],
    ['수분',function(it,attrs){return (attrs&&attrs.moisture)||'-';}],
    ['내한성',function(it,attrs){return (attrs&&attrs.hardiness)||'-';}],
    ['개화 시기',function(it,attrs){return (attrs&&attrs.bloomMonths&&attrs.bloomMonths.length)?attrs.bloomMonths.join(', ')+'월':'-';}],
    ['꽃 색상',function(it,attrs){return (attrs&&attrs.colors&&attrs.colors.length)?attrs.colors.join(', '):'-';}],
    ['용도',function(it,attrs){return (attrs&&attrs.useCats&&attrs.useCats.length)?attrs.useCats.join(', '):'-';}],
    ['관리 난이도(농사로)',function(it){var g=nongsaroGardenByName(it.nm);return (g&&g.managelevelCodeNm)||'-';}]
  ];
}
function buildCompareTableHtml(resolved){
  var rows=compareRowsSpec();
  var html='<table style="width:100%;border-collapse:collapse;min-width:'+(150+resolved.length*220)+'px">';
  html+='<tr>'
    +'<th style="width:150px"></th>'
    +resolved.map(function(r){
      return '<th style="padding:12px;text-align:left;border-bottom:2px solid #121212;vertical-align:bottom">'
        +(r.imgSrc?'<img src="'+r.imgSrc+'" style="width:100%;aspect-ratio:1/1;object-fit:cover;margin-bottom:8px;display:block">':'')
        +'<span style="font-size:14px;font-weight:600;color:#121212;display:block">'+esc(r.it.nm)+'</span>'
        +'<span style="font-size:11px;color:#ABABAB;font-style:italic">'+esc(r.it.sc)+'</span>'
        +'</th>';
    }).join('')
    +'</tr>';
  rows.forEach(function(rowSpec){
    html+='<tr style="border-bottom:1px solid #E6E6E6">'
      +'<td style="padding:10px 12px;font-size:11px;letter-spacing:.5px;color:#ABABAB;font-weight:600;vertical-align:top;white-space:nowrap">'+esc(rowSpec[0])+'</td>'
      +resolved.map(function(r){return '<td style="padding:10px 12px;font-size:13px;color:#121212;vertical-align:top">'+esc(rowSpec[1](r.it,r.attrs,r.match))+'</td>';}).join('')
      +'</tr>';
  });
  html+='</table>';
  return html;
}
var pLastCompareResolved=null;
window.pOpenCompare=function(){
  var items=Object.keys(pCompareSet).map(function(uid){return pCompareSet[uid];});
  if(items.length<2)return;
  document.getElementById('pcmpov').style.display='flex';
  var body=document.getElementById('pcmpbody');
  body.innerHTML='<p style="color:#ABABAB;text-align:center;padding:40px 0">비교 정보를 불러오는 중...</p>';
  Promise.all(items.map(function(rec){
    return staticDataReady.then(function(){
      var match=getStaticMatch(rec.it.sc);
      var key=attrsCacheKeyFor(rec.it);
      var attrs=pAttrCache[key]||(match?deriveCuratedProfile({},match):null);
      var img=rec.el.querySelector('.pc-img img');
      return {it:rec.it,attrs:attrs,match:match,imgSrc:img?img.src:''};
    });
  })).then(function(resolved){
    pLastCompareResolved=resolved;
    body.innerHTML=buildCompareTableHtml(resolved);
  });
};
window.pCloseCompare=function(){document.getElementById('pcmpov').style.display='none';};

/* ---- 내보내기 기능 ----
   가드너·조경전문가·식물전문가 모두 결과를 엑셀 등 다른 도구로 옮겨 쓰고
   싶어할 수 있어("내보내기 기능"), 검색 결과 전체와 비교표를 각각 CSV로
   내려받을 수 있게 한다. 한글이 엑셀에서 깨지지 않도록 UTF-8 BOM을 붙이고,
   이미 로드돼 있는 attrs/정적 데이터만 사용해 추가 네트워크 요청 없이
   즉시 생성한다. */
function csvField(v){
  var s=(v==null?'':String(v));
  if(/[",\n]/.test(s))s='"'+s.replace(/"/g,'""')+'"';
  return s;
}
function downloadCsv(filename,rows){
  var bom=String.fromCharCode(0xFEFF); /* 엑셀에서 한글이 깨지지 않도록 UTF-8 BOM을 앞에 붙인다 */
  var csv=bom+rows.map(function(r){return r.map(csvField).join(',');}).join('\r\n');
  var blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');
  a.href=url;a.download=filename;
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  setTimeout(function(){URL.revokeObjectURL(url);},1000);
}
function dateStamp(){
  var d=new Date();
  function p(n){return (n<10?'0':'')+n;}
  return d.getFullYear()+p(d.getMonth()+1)+p(d.getDate());
}
function buildResultsCsvRows(){
  var header=['국명','학명','과명','출처 분류','자원구분','희귀·특산·멸종위기','광조건','수분','내한성','개화 시기','꽃 색상','용도'];
  var rows=[header];
  pAll.slice(0,pShown).forEach(function(it){
    var key=attrsCacheKeyFor(it);
    var match=getStaticMatch(it.sc);
    var attrs=pAttrCache[key]||(match?deriveCuratedProfile({},match):null);
    var originLabel=it.no?'식물도감':(it.specsId?'식물표본':(BADGE_LABEL[it.origin]||(it.origin==='inat'?'생물다양성DB':(it.origin==='static'?'정원 정보':''))));
    var rare=[];
    if(attrs){
      if(attrs.endemicFlag)rare.push('특산');
      if(attrs.rareFlag)rare.push('희귀');
      if(attrs.endgFlag)rare.push('멸종위기');
    }
    rows.push([
      it.nm,it.sc,(match&&match.name&&match.name.family)||it.fam||'',originLabel,
      (attrs&&attrs.resType)||'',rare.join('/'),
      (attrs&&attrs.sunlight)||'',(attrs&&attrs.moisture)||'',(attrs&&attrs.hardiness)||'',
      (attrs&&attrs.bloomMonths&&attrs.bloomMonths.length)?attrs.bloomMonths.join('/')+'월':'',
      (attrs&&attrs.colors&&attrs.colors.length)?attrs.colors.join('/'):'',
      (attrs&&attrs.useCats&&attrs.useCats.length)?attrs.useCats.join('/'):''
    ]);
  });
  return rows;
}
window.pExportResults=function(){
  if(!pShown){alert('내보낼 검색 결과가 없습니다.');return;}
  staticDataReady.then(function(){
    downloadCsv('식물검색결과_'+dateStamp()+'.csv',buildResultsCsvRows());
  });
};
function buildCompareCsvRows(resolved){
  var rows=compareRowsSpec();
  var header=['항목'].concat(resolved.map(function(r){return r.it.nm;}));
  var out=[header];
  rows.forEach(function(rowSpec){
    out.push([rowSpec[0]].concat(resolved.map(function(r){return rowSpec[1](r.it,r.attrs,r.match);})));
  });
  return out;
}
window.pExportCompare=function(){
  if(!pLastCompareResolved||!pLastCompareResolved.length){alert('비교 정보를 먼저 불러와주세요.');return;}
  downloadCsv('식물비교_'+dateStamp()+'.csv',buildCompareCsvRows(pLastCompareResolved));
};

function renderPage(){
  hideLoading();
  hideAll();
  var g=document.getElementById('pgrid');
  if(pShown===0)g.innerHTML='';
  g.style.display='grid';
  showFilterBarIfNeeded();
  renderFilterPanel();
  var next=pAll.slice(pShown,pShown+PAGE_SIZE);
  next.forEach(function(it){
    var d=document.createElement('div');
    d.className='pc';
    if(it.no)d.setAttribute('data-no',it.no);
    d.setAttribute('data-origin',it.origin||'');
    d.setAttribute('data-uid',it._uid);
    d.onclick=function(){pDetail(it);};
    d.innerHTML='<div class="pc-img">'+PLACEHOLDER_ICON+'</div><button type="button" class="pc-cmpbtn">비교</button><div class="pc-body"><div class="pc-core">'+coreHtml(it)+'</div></div>';
    var cmpBtn=d.querySelector('.pc-cmpbtn');
    cmpBtn.onclick=function(e){e.stopPropagation();pToggleCompare(it,d);};
    g.appendChild(d);
    pCardEls[it._uid]={el:d};
    limitCard(function(){return loadCardImage(it.nm,it.sc,d.querySelector('.pc-img'),function(credit){
      it._hasPhoto=!!credit;
      reflowGrid();
    });});
    loadAndRenderAttrs(d,it);
  });
  pShown+=next.length;
  document.getElementById('pcnt').style.display='flex';
  document.getElementById('pcnttxt').textContent='총 '+pAll.length.toLocaleString()+'건 중 '+pShown+'건 표시';
  document.getElementById('pmorewrap').style.display=(pShown<pAll.length)?'block':'none';
  var b=document.getElementById('pmorebtn');if(b)b.textContent='더 보기';
  applyFilters();
  reflowGrid(); /* 사진/속성이 도착하기 전에도 rankOf(콘텐츠 충실도) 기준으로 우선 정렬 */
}

window.pCD=function(){document.getElementById('pov').style.display='none';};

function rowsTable(rows){
  if(!rows.length)return uiEmpty('상세 정보가 없습니다.');
  return uiRows(rows);
}

function fmtDate(d){
  return (d&&d.trim()&&d.length===8)?d.slice(0,4)+'.'+d.slice(4,6)+'.'+d.slice(6,8):(d&&d.trim()?d.trim():'-');
}

/* 값이 " "(공백) 하나만 있어도 JS에서는 truthy라 그냥 val()만 쓰면 빈 칸이
   표로 보이는 문제가 있었다 - trim 후 실제 내용이 있을 때만 행을 추가한다. */
function pushRow(rows,label,v){var t=(v||'').toString().trim();if(t)rows.push([label,t]);}
/* 특산식물/적색식물/외래식물/민속식물/종자정보 - 도감(no)·표본(specsId)처럼
   별도 상세조회 오퍼레이션이 없는 대신, 검색 목록 자체에 이미 실려 온 구조화된
   필드(raw)를 그대로 보여준다. 필드명 의미가 불확실한 것(예: blprdEnmnt/
   blprdStmnt)은 잘못된 라벨을 붙이느니 아예 표시하지 않는다. */
function rawDetailRows(origin,raw){
  var rows=[];
  if(origin==='naturalized'){
    pushRow(rows,'원산지',val(raw,'orplcNm'));
    pushRow(rows,'분포지역',val(raw,'distrAraDscrt'));
    pushRow(rows,'생활형',val(raw,'plantLfcclTpcdNm'));
    pushRow(rows,'귀화시기',val(raw,'ntrlzEraTpcdNm'));
    pushRow(rows,'확산정도',val(raw,'plantDistrGrcd'));
    pushRow(rows,'열매유형',val(raw,'frtTpcdNm'));
  } else if(origin==='spclt'||origin==='rare'){
    pushRow(rows,'적색목록 등급',val(raw,'rareTpcdNm'));
  } else if(origin==='folk'){
    pushRow(rows,'식별 특징',val(raw,'flcstPlantIdntfDscrt'));
    pushRow(rows,'특허·활용정보',val(raw,'ptnt'));
  } else if(origin==='seed'){
    pushRow(rows,'채종 방법',val(raw,'clrngMthodCdNm'));
    pushRow(rows,'종자 형태',val(raw,'seedShpTpcdNm'));
    var lo=val(raw,'seedMnmmLngth').trim(),hi=val(raw,'seedMxmmLngth').trim();
    if(lo||hi)rows.push(['종자 길이(㎜)',[lo,hi].filter(function(x){return x;}).join(' ~ ')]);
  }
  return rows;
}
/* 학명·과명·영명은 이제 개요 맨 위 공통 슬롯(#pdcore)에서 출처와 무관하게
   같은 형식으로 보여주므로, raw(특산/적색/외래) 데이터에서 이 세 필드만
   따로 뽑아둔다 - rawDetailRows 본문 표에는 더 이상 섞이지 않는다. */
function rawCoreFields(origin,raw){
  if(origin==='naturalized')return{family:'',engNm:val(raw,'plantEngNm')};
  if(origin==='spclt'||origin==='rare')return{family:val(raw,'familyKorNm')||val(raw,'apgFamilyKorNm')||val(raw,'agpFamilyKorNm'),engNm:''};
  return{family:'',engNm:''};
}
var ORIGIN_NOTICE={
  spclt:'국립수목원 특산식물 목록에 포함된 종입니다. 한국에서만 자라거나 분포가 매우 제한적인 식물입니다.',
  rare:'국립수목원 적색식물 목록에 포함된 종입니다. 자생지 감소 등으로 보전이 필요한 것으로 평가된 식물입니다.',
  naturalized:'국립수목원 외래식물 목록에 포함된 종입니다. 국내에 유입되어 야생에서 자라고 있는 외래 기원 식물입니다.',
  folk:'국립수목원 민속식물 목록에 포함된 종으로, 전통적으로 생활 속에서 이용되어 온 식물입니다.',
  seed:'국립수목원 종자정보 목록에 포함된 종으로, 채종·번식 관련 정보 위주로 제공됩니다.'
};
var ORIGIN_BADGE_TXT={spclt:'특산식물',rare:'적색식물',naturalized:'외래식물',folk:'민속식물',seed:'종자정보'};

/* ---- 역할별 탭 구조 ----
   "정원 가이드도 개요에 포함" 요청에 따라 원래 4개(개요/정원 가이드/조경 스펙/
   학술정보)였던 탭을 계속 줄여왔고, 이제 정원 가이드까지 개요에 합쳐 남는
   탭은 개요(overview)와 이야기(story) 두 개뿐이다. 개요는 학명·과명·영명
   →광조건·수분·개화시기→그 아래 나머지(설명/조경 스펙/농사로·발간자료/
   학술정보/가드닝 콘텐츠) 순으로, 이름이 고정된 슬롯(overviewSkeleton)에
   나눠 채운다. */
/* "이야기도 개요에 포함시켜, 그러면 별도 탭이 필요 없을 것" 요청에 따라
   탭 구조 자체를 없앤다 - 상세창에는 이제 스크롤 한 번으로 끝까지 읽는
   단일 패널(#pdpane-overview)만 있고, 예전에 "이야기" 탭에 있던 이름의
   유래·숲이야기는 개요 맨 끝에 이어지는 한 섹션(#pdstory)이 된다. */
function pdPane(){return document.getElementById('pdpane-overview');}
function pdSet(html){var p=pdPane();if(p)p.innerHTML=html;}
/* 자원구분(자생종·재배품종·외국종)과 희귀·특산·멸종위기 지정 여부는 국립
   수목원이 직접 평가해둔 값이라(deriveCuratedProfile 주석 참고), 어느
   origin의 상세창이든 학명이 정적 데이터셋과 일치하면 학술정보 자리에
   공통으로 보여줄 수 있다. 학명/과명은 이제 개요 맨 위 공통 슬롯(#pdcore)에
   이미 표시되므로 여기서는 중복하지 않는다. */
function pdRarityRows(match){
  var rows=[];
  var nmRec=match&&match.name;
  if(nmRec)pushRow(rows,'자원구분',nmRec.resType);
  return rows;
}
function pdRarityBadgesHtml(match){
  var nmRec=match&&match.name;
  if(!nmRec)return '';
  var items=[];
  if(nmRec.endemic==='1')items.push(['특산식물','native']);
  if(nmRec.rare==='1')items.push(['희귀식물','native']);
  if(nmRec.endg1==='1'||nmRec.endg2==='1')items.push(['멸종위기종','caution']);
  if(!items.length)return '';
  return '<div class="pc-badges" style="margin:0 0 20px">'+items.map(function(p){return '<span class="pc-rolebadge '+p[1]+'">'+esc(p[0])+'</span>';}).join('')+'</div>';
}
/* 개요 슬롯 중 비동기로 늦게 도착하는 조각(농사로 관리정보/조경 스펙, 발간
   도서 정원가이드/조경북, 희귀·자원구분 학술정보, 가드닝 콘텐츠, 이름의
   유래·숲이야기)을 한 번에 채우는 공용 로직 - profile이 없으면(도감·정적
   데이터셋 어디에도 없는 종) 큐레이션 블록 없이 농사로·발간자료만, 그마저
   없으면 각 슬롯이 빈 채로 남는다(불필요한 "정보 없음" 문구를 슬롯마다
   반복하지 않음).
   extraAcademicHtml은 표본 채집 기록처럼 특정 분기에만 존재하는 근거자료
   조각을 위한 선택적 프로미스/문자열이다.
   ▶"이야기도 개요에 포함, 별도 탭 불필요" 요청에 따라 이야기 탭도 없애고
   개요 맨 끝 고정 슬롯(#pdstory)으로 흡수한다 - 결과적으로 탭 없이 개요
   하나만 남는다.
   ▶"조경 스펙", "좋아하는 꽃" 표제 텍스트는 삭제 요청에 따라 더 이상 붙이지
   않는다(내용은 각자의 슬롯/농사로 자체 표제 아래 그대로 유지). */
function pdFillOverviewExtras(profile,match,sc,nm,nsData,extraAcademicHtml){
  var bookData=bookProfileData(sc);
  var storyData=forestStoryHtml(nm);
  var generalData=nongsaroGeneralHtml(nm,profile&&profile.colors);
  Promise.all([nsData,Promise.resolve(extraAcademicHtml||''),bookData,storyData,generalData]).then(function(res){
    var ns=res[0]||{},extra=res[1]||'',bk=res[2]||{},fs=res[3]||'',general=res[4]||'';
    setEl('pdnsgarden',ns.gardenHtml||'');
    setEl('pdnslandscape',ns.landscapeHtml||'');
    setEl('pdbookgarden',bk.gardenHtml||'');
    setEl('pdbooklandscape',bk.landscapeHtml||'');
    var rarityRowsArr=pdRarityRows(match);
    var rarityTable=rarityRowsArr.length?rowsTable(rarityRowsArr):'';
    var badges=pdRarityBadgesHtml(match);
    var academicInner=badges+rarityTable+extra+(ns.academicHtml||'');
    var hasAcademic=!!(badges||rarityTable||extra||ns.academicHtml);
    setEl('pdacademic',hasAcademic?uiSection('학술정보',academicInner):'');
    setEl('pdgeneral',general);
    setEl('pdstory',(bk.storyHtml||'')+fs);
  }).catch(function(){
    setEl('pdstory','');
  });
}

window.pDetail=function(it){
  var no=it.no,nm=it.nm,sc=it.sc,specsId=it.specsId,origin=it.origin,raw=it.raw;
  var panel=document.getElementById('pdpanel');
  panel.style.position='';panel.style.left='';panel.style.top='';panel.style.margin='';
  /* "상단에 국명과 학명을 넣어야지, 국명을 크게" 요청 대응 - 국가표준식물목록에
     아직 국명이 등록되지 않은 종(주로 iNaturalist/정적 데이터셋 보충 항목)은
     it.nm이 비어 있거나 '이름 없음'이라, 그대로 쓰면 큰 제목(h2)이 텅 비고
     작고 흐린 학명만 남아 헤더가 깨져 보였다. 국명이 없으면 학명을 대신
     큰 제목 자리에 올리고, 그 경우 아래 학명 줄은 같은 문자열이 중복되므로
     숨긴다. */
  var hasKorNm=!!(nm&&nm.trim()&&nm.trim()!=='이름 없음');
  var sciEl=document.getElementById('pdsci');
  document.getElementById('pdname').textContent=hasKorNm?nm:(sc||'이름 미확인');
  if(hasKorNm&&sc){sciEl.textContent=sc;sciEl.style.display='';}
  else{sciEl.textContent='';sciEl.style.display='none';}
  document.getElementById('pdbadge').textContent=no?'식물도감':(specsId?'식물표본':(ORIGIN_BADGE_TXT[origin]||'커뮤니티 데이터'));
  pdSet(overviewSkeleton());
  setPdCore(sc,'','');
  var creditEl=document.getElementById('pdcredit');
  creditEl.style.display='none';
  document.getElementById('pov').style.display='flex';
  var pdimg=document.getElementById('pdimg');
  pdimg.innerHTML=PLACEHOLDER_ICON;
  /* 상세창은 카드 그리드용 대표 사진 1장이 아니라, 여러 소스를 모두 훑어
     가능한 만큼 모은 사진을 슬라이드로 보여준다("가능한 많은 이미지"). 신뢰도
     높은 국립수목원·농사로 사진(fast)이 먼저 도착하면 바로 보여주고, 위키·
     iNaturalist·GBIF·수피까지 다 모이면(all) 최종 사진 목록으로 한 번 더
     갱신한다 - 느린 소스 때문에 빠른 소스까지 늦게 뜨는 일을 막는다. */
  var photoBundle=fetchAllPhotos(nm,sc);
  var photoRenderToken=++pDetailToken;
  photoBundle.fast.then(function(photos){
    if(pDetailToken!==photoRenderToken)return;
    if(photos.length)renderImageSlider(pdimg,creditEl,photos);
  });
  photoBundle.all.then(function(photos){
    if(pDetailToken!==photoRenderToken)return;
    renderImageSlider(pdimg,creditEl,photos);
  });
  /* 개요 탭 안의 정원가이드/조경 스펙/학술정보 슬롯과 이야기 탭이 공유하는
     농사로 조회는 origin과 무관하게 학명 기준으로 한 번만 호출해 나눠 쓴다.
     숲이야기·발간도서 조회(bookProfileData)는 nm/sc만 있으면 되므로
     pdFillOverviewExtras 안에서 직접 호출한다. */
  var nsData=nongsaroPanelData(nm,sc);

  if(no){
    /* 카드에 정원정보 칩을 채울 때 이미 같은 종의 상세정보를 받아둔 경우가
       대부분이므로(fetchPlantAttrs), fetchPilbkItem 캐시를 그대로 재사용해
       중복 네트워크 요청 없이 즉시 렌더링한다. */
    Promise.all([fetchPilbkItem(no),staticDataReady]).then(function(res){
      var item=res[0];
      var match=getStaticMatch(sc||(item&&val(item,'plantSpecsScnm')));
      var family=(match&&match.name&&match.name.family)||'';
      if(!item){
        setPdCore(sc,family,'');
        setEl('pdbody','<p style="color:#ABABAB;text-align:center;padding:20px 0">상세 정보가 없습니다.</p>');
        pdFillOverviewExtras(null,match,sc,nm,nsData);
        return;
      }
      var engNm=val(item,'engNm');
      family=family||val(item,'familyKorNm')||val(item,'apgFamilyKorNm')||'';
      setPdCore(sc,family,engNm);
      var rows=[];
      pushRow(rows,'형태',val(item,'shpe'));
      pushRow(rows,'분포',val(item,'dstrb'));
      pushRow(rows,'해외분포',val(item,'osDstrb'));
      pushRow(rows,'생육환경',val(item,'grwEvrntDesc'));
      pushRow(rows,'이용방법',val(item,'useMthdDesc'));
      pushRow(rows,'원산지',val(item,'orplcNm'));
      pushRow(rows,'비고',val(item,'note'));
      setEl('pdbody',rowsTable(rows));
      var profile=pAttrCache[no]||deriveCuratedProfile(item,match);
      pAttrCache[no]=profile;
      applyCuratedProfile(profile);
      pdFillOverviewExtras(profile,match,sc,nm,nsData);
    }).catch(function(e){
      setEl('pdbody','<p style="color:#DC2B2B;text-align:center;padding:20px 0">'+esc(e.message)+'</p>');
      pdFillOverviewExtras(null,getStaticMatch(sc),sc,nm,nsData);
    });
  } else if(specsId){
    var url2=buildUrl('/plantSmplUnitList',{serviceKey:KEY,pageNo:1,numOfRows:5,reqPlantSpecsId:specsId});
    var specimenHtml=fetchJson(url2).then(function(data){
      var res=(data&&data.response)||{};
      var header=res.header||{};
      var body=res.body||{};
      if(header.resultCode==='03'||!parseInt(body.totalCount||0,10)){
        setEl('pdbody','<p style="color:#ABABAB;text-align:center;padding:20px 0">표본 정보가 없습니다.</p>');
        return '';
      }
      if(header.resultCode!=='00'){throw new Error(header.resultMsg||'표본 정보를 불러올 수 없습니다.');}
      var tot=body.totalCount||'0';
      var items=normalizeItems(body.items);
      var notice='<p style="color:#787878;font-size:13px;margin:0 0 20px;line-height:1.7">국립수목원 식물도감에는 아직 등록되지 않은 종으로, 표본관에 소장된 채집 기록 '+esc(tot)+'건 중 일부를 아래 학술정보에서 확인할 수 있습니다.</p>';
      setEl('pdbody',notice);
      if(!items.length)return '';
      var html='<div style="border-top:1px solid #E6E6E6;padding-top:24px;margin-top:8px"><p style="font-size:11px;font-weight:600;letter-spacing:1.5px;color:#121212;margin:0 0 12px">표본 채집 기록 · 국립수목원 표본관</p><table style="width:100%;border-collapse:collapse">';
      html+='<tr style="border-bottom:1px solid #E6E6E6"><td style="padding:10px 0;color:#ABABAB;font-size:11px;letter-spacing:1px;font-weight:600">소장기관</td><td style="padding:10px 0;color:#ABABAB;font-size:11px;letter-spacing:1px;font-weight:600">채집지</td><td style="padding:10px 0;color:#ABABAB;font-size:11px;letter-spacing:1px;font-weight:600">채집일</td></tr>';
      items.forEach(function(sit){
        var inst=val(sit,'bspcsInsttNm')||'-';
        var loc=val(sit,'clarNm')||'-';
        var dt=fmtDate(val(sit,'smplCllcnDt'));
        html+='<tr style="border-bottom:1px solid #E6E6E6"><td style="padding:10px 0;color:#121212;font-size:13px">'+esc(inst)+'</td><td style="padding:10px 0;color:#121212;font-size:13px">'+esc(loc)+'</td><td style="padding:10px 0;color:#121212;font-size:13px">'+esc(dt)+'</td></tr>';
      });
      html+='</table></div>';
      return html;
    }).catch(function(e){
      setEl('pdbody','<p style="color:#DC2B2B;text-align:center;padding:20px 0">'+esc(e.message)+'</p>');
      return '';
    });
    staticDataReady.then(function(){
      var match=getStaticMatch(sc);
      var key=attrsCacheKeyFor(it);
      var profile=match?(pAttrCache[key]||deriveCuratedProfile({},match)):null;
      if(profile)pAttrCache[key]=profile;
      setPdCore(sc,(match&&match.name&&match.name.family)||'','');
      applyCuratedProfile(profile);
      pdFillOverviewExtras(profile,match,sc,nm,nsData,specimenHtml);
    });
  } else if(raw){
    /* 특산식물/적색식물/외래식물/민속식물/종자정보 - 별도 상세조회 API가 없어
       검색 목록에 이미 실려 온 필드를 그대로 보여준다(추가 네트워크 요청 없음).
       다만 학명이 정적 데이터셋(국가표준식물목록)과 일치하면, 도감 항목과 동일한
       정원 큐레이션 프로필도 함께 보여줄 수 있다. */
    var coreFields=rawCoreFields(origin,raw);
    setPdCore(sc,coreFields.family,coreFields.engNm);
    var rows=rawDetailRows(origin,raw);
    var notice=ORIGIN_NOTICE[origin]?'<p style="color:#787878;font-size:13px;margin:0 0 20px;line-height:1.7">'+esc(ORIGIN_NOTICE[origin])+'</p>':'';
    setEl('pdbody',notice+rowsTable(rows));
    staticDataReady.then(function(){
      var match=getStaticMatch(sc);
      var key=attrsCacheKeyFor(it);
      var profile=match?(pAttrCache[key]||deriveCuratedProfile({},match)):null;
      if(profile)pAttrCache[key]=profile;
      var family=coreFields.family||(match&&match.name&&match.name.family)||'';
      setPdCore(sc,family,coreFields.engNm);
      applyCuratedProfile(profile);
      pdFillOverviewExtras(profile,match,sc,nm,nsData);
    });
  } else if(origin==='static'){
    /* "정원 정보로 찾기"(검색어 없이 필터만으로 찾은) 결과 - 도감 상세(no)
       없이 정적 데이터셋(국가표준식물목록)의 항목별 서술을 그대로 상세 행으로
       보여준다. */
    staticDataReady.then(function(){
      var match=getStaticMatch(sc);
      var sp=match&&match.species;
      var rows=[];
      if(sp){
        pushRow(rows,'형태',sp.form);
        pushRow(rows,'높이',sp.height);
        pushRow(rows,'잎',sp.leaf);
        pushRow(rows,'꽃',sp.flower);
        pushRow(rows,'열매',sp.fruit);
        pushRow(rows,'줄기',sp.stem);
        pushRow(rows,'뿌리',sp.root);
        pushRow(rows,'생육환경',sp.env);
        pushRow(rows,'번식',sp.propagate);
        pushRow(rows,'이용',sp.use);
        pushRow(rows,'유사종',sp.similar);
        pushRow(rows,'특이사항',sp.note);
        pushRow(rows,'병충해',sp.pest);
        pushRow(rows,'방제',sp.control);
        pushRow(rows,'자생지',sp.habitat);
        pushRow(rows,'원산지',sp.orig);
      }
      var notice='<p style="color:#787878;font-size:13px;margin:0 0 20px;line-height:1.7">검색어 없이 \'정원 정보로 찾기\' 조건만으로 국가표준식물목록에서 찾은 종입니다.</p>';
      setPdCore(sc,(match&&match.name&&match.name.family)||'','');
      setEl('pdbody',notice+rowsTable(rows));
      var key=attrsCacheKeyFor(it);
      var profile=match?(pAttrCache[key]||deriveCuratedProfile({},match)):null;
      if(profile)pAttrCache[key]=profile;
      applyCuratedProfile(profile);
      pdFillOverviewExtras(profile,match,sc,nm,nsData);
    });
  } else {
    setEl('pdbody','<p style="color:#787878;font-size:13px;text-align:center;padding:20px 0;line-height:1.7">국립수목원 도감·표본 자료에는 없는 종으로, 생물다양성 커뮤니티 데이터(iNaturalist)에서 국명·학명 일치를 확인해 보충한 항목입니다. 형태·분포 등 상세 설명은 제공되지 않습니다.</p>');
    staticDataReady.then(function(){
      var match=getStaticMatch(sc);
      var profile=match?deriveCuratedProfile({},match):null;
      setPdCore(sc,(match&&match.name&&match.name.family)||'','');
      applyCuratedProfile(profile);
      pdFillOverviewExtras(profile,match,sc,nm,nsData);
    });
  }
};

/* ---- 상세정보 창 드래그 이동 ----
   처음엔 상단의 얇은 그립(4px 막대)만 드래그 시작점이어서 실제로는 그 좁은
   줄을 정확히 잡아야만 이동이 됐다(사용자 확인: 헤더를 잡아도 움직이지 않음).
   그립은 "여기를 잡아 옮기세요"라는 시각적 표시로 남기되, 실제 드래그 시작
   영역은 헤더 전체(#pdhead)로 넓혀서 제목/배지 어디를 잡아도 이동하게 한다.
   단, 헤더 안의 닫기(X) 버튼은 클릭이 그대로 동작해야 하므로 드래그 시작에서
   제외한다. */
(function initDrag(){
  var panel=document.getElementById('pdpanel');
  var head=document.getElementById('pdhead');
  var grip=document.getElementById('pdgrip');
  if(!panel||!head)return;
  var dragging=false,moved=false,startX=0,startY=0,startLeft=0,startTop=0;
  function onDown(e){
    if(e.target.closest('button'))return; /* 닫기 버튼은 드래그 대상에서 제외 */
    var pt=e.touches?e.touches[0]:e;
    var rect=panel.getBoundingClientRect();
    dragging=true;moved=false;
    startX=pt.clientX;startY=pt.clientY;
    startLeft=rect.left;startTop=rect.top;
    head.style.cursor='grabbing';
    if(grip)grip.style.cursor='grabbing';
  }
  function onMove(e){
    if(!dragging)return;
    var pt=e.touches?e.touches[0]:e;
    var dx=pt.clientX-startX,dy=pt.clientY-startY;
    if(!moved&&Math.abs(dx)<3&&Math.abs(dy)<3)return; /* 3px 미만은 클릭으로 간주, 아직 fixed로 전환 안 함 */
    if(!moved){
      moved=true;
      panel.style.position='fixed';
      panel.style.margin='0';
      panel.style.left=startLeft+'px';
      panel.style.top=startTop+'px';
    }
    var newLeft=startLeft+dx,newTop=startTop+dy;
    var maxLeft=window.innerWidth-60,maxTop=window.innerHeight-60;
    newLeft=Math.max(60-panel.offsetWidth,Math.min(newLeft,maxLeft));
    newTop=Math.max(0,Math.min(newTop,maxTop));
    panel.style.left=newLeft+'px';
    panel.style.top=newTop+'px';
    e.preventDefault();
  }
  function onUp(){
    dragging=false;moved=false;
    head.style.cursor='grab';
    if(grip)grip.style.cursor='grab';
  }
  head.addEventListener('mousedown',onDown);
  head.addEventListener('touchstart',onDown,{passive:true});
  window.addEventListener('mousemove',onMove,{passive:false});
  window.addEventListener('touchmove',onMove,{passive:false});
  window.addEventListener('mouseup',onUp);
  window.addEventListener('touchend',onUp);
})();

/* "정원 정보로 찾기" 패널은 검색을 한 번도 하지 않은 첫 화면에서도 바로
   보여야 하는데(상시 노출 요구사항), renderFilterPanel()이 지금까지는
   칩을 클릭하거나 검색 결과가 그려질 때(renderPage 안)만 호출되고 있었다
   - 그래서 페이지를 막 열었을 때는 "식물 유형 / 출처 분류 / ..." 라는
   빈 제목만 보이고 실제 선택할 칩(꽃나무/관목, 자생식물, 보라색꽃 등)이
   하나도 그려지지 않는 문제가 있었다. 페이지 로드 시점에 한 번 직접
   호출해 칩을 미리 채워둔다 - 정적 데이터셋과 무관하게 즉시 그려지는
   고정 목록(USECAT_OPTS/ORIGIN_OPTS/색상/생활형/광조건)이므로 네트워크
   응답을 기다릴 필요가 없다. */
renderFilterPanel();
updateFilterBadge();
})();
