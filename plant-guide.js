
(function(){
var PB='https://nongsaro-proxy.chgreena.workers.dev/gov/plant';
/* [2026-09-18] 공공데이터포털 인증키(KEY)는 이 파일에서 완전히 걷어냈다. 정부 API 는 전부
   nongsaro-proxy 워커의 /gov/* 로 부르고 키는 워커가 붙인다(워커는 클라이언트가 보낸
   serviceKey 를 무시한다). 이 파일은 GitHub Pages 에 공개되므로 키를 두면 안 된다. */
/* [2026-09-18] 이 스크립트는 식물도감 페이지(/plant-guide)뿐 아니라 Webflow 기사 템플릿에도
   실려 있어 모든 기사 방문마다 농사로 3종·표준식물목록 5,000행을 내려받고 있었다(마스터 v1.5
   16절 D4). 검색창(#psi)이 없는 페이지에서는 상단 선로딩을 하지 않는다. (스크립트는 defer 라
   이 시점에 DOM 은 이미 파싱돼 있다.) */
var PG_PAGE=!!document.getElementById('psi');
var pQ='',pST=null,pAll=[],pShown=0;
/* "색인(초성)을 좌우로 왔다갔다 하면 결과값이 사라진다" 버그 대응 - 초성
   색인은 usecat 필터보다 훨씬 큰 결과(한 자음이 전체 3.6만종의 1/14 가량,
   수천 건)를 만들어내는데, renderPage()가 카드마다 사진/정원정보/정원등급
   요청을 큐에 쌓아두고 그 완료 콜백마다 다시 화면 전체를 정렬/필터링한다.
   자음을 빠르게 여러 번 바꾸면 이전에 누른 자음들의 카드·요청이 아직 다
   끝나지 않은 채로 새 렌더가 계속 쌓여, 결국 브라우저가 수십 초간 멈추고
   그 사이엔 아무 결과도 안 보여 "사라졌다"로 느껴진다.
   [2026-09-23 정밀진단으로 대체] 예전엔 "렌더 세대 번호"(pRenderGen)를 두어
   해결했었다 - 렌더할 때마다 번호를 올리고 각 카드에 붙여둔 뒤, 완료 콜백이
   최신 세대가 아니면 조용히 빠지는 방식. 그런데 renderPage()는 한 번의 검색
   안에서도 소스(최대 9개)가 도착할 때마다 다시 불려서 세대 번호가 계속
   올라갔다 - 자음/필터를 안 바꿨는데도 이미 대기열에 들어간(아직 실행 전)
   같은 검색의 카드 요청이 "낡았다"고 오판돼 통째로 버려졌다(사진 카드 다수가
   빈 채로 남거나 "분석 중"에 멈추는 실제 원인 중 하나 - loadAndRenderAttrs는
   2026-09-19 A1에서 먼저 이 문제를 겪고 고쳐졌었는데, 카드 사진(imgTask)과
   정원등급(loadGardenTier)엔 같은 수정이 빠져 있었다). 진짜 "낡았다"의 기준은
   세대 숫자가 아니라 그 카드 DOM이 실제로 화면에서 떨어져 나갔는지
   (d.isConnected)다 - 완전히 새 검색/필터면 renderPage가 g.innerHTML=''로
   옛 카드를 실제로 떼어내 isConnected가 자연히 false가 되고, 같은 검색 안의
   소스 도착만으로는 카드가 안 떨어지므로 계속 유효하다고 본다. 이제 imgTask·
   loadGardenTier 모두 d.isConnected 기준으로 통일했다(자세한 내용은 각 함수
   참고). */
/* 상세창 사진을 fast/all 두 단계로 나눠 렌더링하면서 생기는 경쟁 상태 방지용
   토큰 - 상세창을 열자마자 다른 식물을 다시 클릭하면, 먼저 연 상세창의 느린
   단계(all) 응답이 나중에 도착해 지금 보고 있는 다른 식물의 슬라이드를
   덮어쓸 수 있다. pDetail이 호출될 때마다 값을 올리고, 각 렌더링 콜백은 자기
   토큰이 최신일 때만 실제로 화면을 갱신한다. */
var pDetailToken=0;
/* "더 보기 버튼이 꼭 필요한 게 아니라면 전체 검색값이 한 번에 노출되도록"
   요청에 따라 페이지 단위를 사실상 무제한으로 둔다 - renderPage 한 번에
   그 시점까지 모인 결과 전체를 카드로 그린다(단계별로 도착하는 소스마다
   다시 호출되므로 여전히 점진적으로 채워진다). 카드 수가 수백 건이어도
   브라우저가 느려지지 않도록, 실제 데이터 로딩은 limitCard 동시요청 제한
   대기열(renderPage 참고)을 그대로 거친다. */
var PAGE_SIZE=Infinity;

/* ---- 상세창 공통 디자인 토큰 ----
   "줄간격·행간·이모지·아이콘·박스 디자인이 제각각이라 보기 불편하다"는
   지적에 따라, 상세창 안의 모든 서술형 섹션(학술정보/농사로/발간도서·
   숲이야기 등)이 같은 여백·줄간격·구분선·라벨 스타일을 쓰도록 공용
   헬퍼로 통일한다. 사이트 자체 스타일 가이드(Pretendard 폰트, neutral 팔레트,
   radius 0의 각진 flat 디자인, --neutral-300 #E6E6E6 구분선)를 그대로
   따르며, 섹션마다 24/24·24/8처럼 제각각이던 여백을 32px 한 값으로
   맞추고, 본문 줄간격도 1.6~1.9로 흩어져 있던 것을 1.75~1.8 두 값으로
   좁혔다. */
/* 라벨 칸(UI_ROW_LABEL)에 줄간격을 지정하지 않았더니 사이트 전역 기본
   줄간격(약 28px, 18px 기준)을 그대로 물려받아, 같은 행의 값 칸(1.75 =
   14px*1.75=24.5px)과 줄간격이 어긋나 라벨·값이 미묘하게 다른 높이로
   보였다(글자 강약이 흐트러져 보이는 원인 중 하나) - 값 칸과 같은 비율로
   맞춘다. */
var UI_ROW_LABEL='padding:16px 0;color:#ABABAB;width:30%;font-size:11px;letter-spacing:.2px;vertical-align:top;font-weight:500;line-height:1.75';
var UI_ROW_VALUE='padding:16px 0;color:#121212;font-size:13px;line-height:1.75';
/* [백로그 38 P1-E] 형태·분포·생육환경처럼 원문이 그대로 오는 값(최장 420자
   실측)은 모바일 한 화면의 6배 가까이 늘어져 스캔이 안 된다는 지적 대응.
   60자보다 긴 값만 4줄 클램프+"더 보기"로 감싼다(짧은 라벨-값, 예: 학명·
   과명은 그대로). 클램프는 모바일 전용 CSS(.ui-clamp, pEnsurePovAnimStyle
   참고)라 데스크톱에선 클래스가 붙어도 눈에 보이는 변화가 없고, 버튼도
   pApplyClamps가 실제로 넘치는 경우에만 보여준다. */
var UI_CLAMP_THRESHOLD=60;
/* [백로그 38 P2-F] ≤640px 표가 라벨 30%·값 70% 2열이라 라벨 칸이 좁아
   값이 줄바꿈되던 문제 - class="ui-rowtable"을 달아, 모바일 전용 CSS
   (pEnsurePovAnimStyle)로 표/행/칸을 전부 block으로 바꿔 "라벨 위(작게,
   #6E6E6E)/값 아래(15px)" 1열로 쌓는다. 데스크톱은 원래 2열 표 그대로. */
function uiRows(rows){
  if(!rows||!rows.length)return'';
  return '<table class="ui-rowtable" style="width:100%;border-collapse:collapse">'+rows.map(function(r){
    var val=esc(r[1]);
    var valHtml=(r[1]&&r[1].length>UI_CLAMP_THRESHOLD)
      ?'<div class="ui-clamp">'+val+'</div><span class="ui-clamp-btn" onclick="pToggleClamp(this)" style="display:none;color:#0B5345;font-size:11px;font-weight:600;cursor:pointer;margin-top:6px">더 보기</span>'
      :val;
    return '<tr style="border-bottom:1px solid #E6E6E6"><td style="'+UI_ROW_LABEL+'">'+esc(r[0])+'</td><td style="'+UI_ROW_VALUE+'">'+valHtml+'</td></tr>';
  }).join('')+'</table>';
}
/* clamp가 실제로 텍스트를 잘라낼 때만("더 보기"가 필요할 때만) 버튼을
   보여준다 - 60자를 살짝 넘겨 4줄 안에 다 들어가는 값까지 괜히 버튼을
   달지 않기 위해 실측(scrollHeight)으로 한 번 더 확인한다. */
function pApplyClamps(container){
  if(!container||!container.querySelectorAll)return;
  Array.prototype.forEach.call(container.querySelectorAll('.ui-clamp'),function(clamp){
    var btn=clamp.nextElementSibling;
    if(!btn||!btn.classList||!btn.classList.contains('ui-clamp-btn'))return;
    var overflowing=clamp.scrollHeight>clamp.clientHeight+1;
    btn.style.display=overflowing?'inline-block':'none';
    if(overflowing)clamp.dataset.ch=clamp.clientHeight; /* [C2] 접힌(4줄) 상태의 실제 렌더 높이 - 펼침/접힘 애니메이션의 시작·종료값으로 쓴다 */
  });
}
/* [2026-09-19 UX 미세점검 C2] 예전엔 -webkit-line-clamp를 4↔none으로 즉시
   바꿔 50ms 안에 펼쳐져 애니메이션이 없었다(line-clamp 자체는 transition이
   안 먹는 속성). 대신 max-height를 접힌 높이↔전체 높이로 .2s 애니메이션하고,
   펼칠 때는 그 직전에 line-clamp를 미리 꺼서 늘어나는 동안 전체 텍스트가
   드러나게 한다(scrollHeight는 line-clamp가 걸려있어도 이미 전체 높이를
   보고한다 - pApplyClamps가 넘침 판정에 쓰는 것과 같은 성질). */
window.pToggleClamp=function(btn){
  var clamp=btn.previousElementSibling;
  if(!clamp)return;
  var expanding=clamp.dataset.expanded!=='1';
  var collapsedH=parseFloat(clamp.dataset.ch||clamp.clientHeight)||0;
  if(expanding){
    var fullH=clamp.scrollHeight;
    clamp.style.maxHeight=collapsedH+'px';
    clamp.style.webkitLineClamp='none';
    clamp.getBoundingClientRect(); /* 강제 리플로우 - 위 maxHeight를 "시작값"으로 먼저 적용시켜, 바로 다음 줄의 변경이 transition 대상이 되게 한다 */
    clamp.style.maxHeight=fullH+'px';
    clamp.dataset.expanded='1';
    btn.textContent='접기';
  } else {
    clamp.style.maxHeight=clamp.scrollHeight+'px';
    clamp.getBoundingClientRect();
    clamp.style.maxHeight=collapsedH+'px';
    clamp.dataset.expanded='0';
    btn.textContent='더 보기';
  }
  clamp.ontransitionend=function(){
    clamp.ontransitionend=null;
    if(clamp.dataset.expanded==='1')clamp.style.maxHeight='none';
    else{clamp.style.webkitLineClamp='4';clamp.style.maxHeight='';}
  };
};
function uiSection(title,inner){
  if(!inner)return'';
  return '<div style="border-top:1px solid #E6E6E6;padding-top:32px;margin-top:32px">'
    +(title?'<p style="font-size:11px;font-weight:600;letter-spacing:1px;color:#121212;margin:0 0 16px">'+esc(title)+'</p>':'')
    +inner+'</div>';
}
function uiBody(text){return text?'<p style="color:#121212;font-size:13px;line-height:1.8;margin:0 0 16px;white-space:pre-line">'+esc(text)+'</p>':'';}
function uiLabeledText(label,text){return text?'<p style="color:#121212;font-size:13px;line-height:1.8;margin:0 0 14px"><b style="font-weight:600">'+esc(label)+'</b> — '+esc(text)+'</p>':'';}
function uiEmpty(msg){return '<p style="color:#ABABAB;text-align:center;padding:28px 0;font-size:13px;line-height:1.7">'+esc(msg||'정보가 없습니다.')+'</p>';}
/* [백로그 38 P2-H] 태그가 정보 표시만 하고 아무 동작이 없다는 지적 - 탭하면
   같은 말로 검색한다(기존 pSuggest 재사용). 상세창을 그대로 둔 채 뒤에서
   검색 결과만 바뀌면 헷갈리므로 pTagSearch가 패널을 먼저 닫는다. */
function uiTag(t){return '<span onclick="pTagSearch(\''+String(t).replace(/'/g,"")+'\')" style="display:inline-block;border:1px solid #E6E6E6;padding:4px 10px;font-size:11px;color:#787878;margin:0 6px 6px 0;letter-spacing:.2px;cursor:pointer">#'+esc(t)+'</span>';}
/* [백로그 38 P2-H 후속] pHidePov()를 직접 불러 닫으면 history의 'detail'
   상태가 안 지워져(pCD는 history.back()으로 닫는데 여기선 건너뜀) 태그
   검색 뒤 뒤로가기를 누르면 복원 로직이 엉킬 수 있다는 지적(비즈니스
   세션) - pCD()로 정식으로 닫고, history.back()이 실제로 걸렸을 때만
   그 popstate가 끝난 뒤(이벤트 자체를 기다림, 임의의 시간차 추측 아님)
   검색을 실행한다. */
/* [2026-09-19 UX 미세점검 A3] 태그를 탭하면 그 글자 그대로 이름 검색으로
   보내(pSuggest) 텍스트 검색 API가 카테고리를 이해 못 해 결과가 안 바뀌는
   문제가 있었다(실측: "#꽃나무/관목" 탭해도 11건 그대로 - 이름 검색으로는
   의미 없는 요청). 태그가 식물 유형(USECAT_OPTS) 값이면 그 패싯 필터로
   전환해 "같은 유형 더 보기"가 되게 하고, 유형표에 없는 자유서술 태그는
   예전처럼 이름 검색으로 보낸다. */
window.pTagSearch=function(term){
  var wasDetail=!!(history.state&&history.state.type==='detail');
  function afterClose(){
    if(USECAT_OPTS.indexOf(term)!==-1){
      pQ='';
      var psi=document.getElementById('psi');if(psi)psi.value='';
      pUpdateClearBtn();
      pFilter.usecat=[term];
      renderFilterPanel();
      updateFilterBadge();
      pHistPushSearch();
      runFacetSearch();
    } else {
      window.pSuggest(term);
    }
    var panel=document.getElementById('pfilterbar');
    if(panel)panel.scrollIntoView({behavior:'auto',block:'start'});
  }
  window.pCD();
  if(wasDetail){
    window.addEventListener('popstate',function onPop(){
      window.removeEventListener('popstate',onPop);
      afterClose();
    },{once:true});
  } else {
    afterClose();
  }
};
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
  if(!NONGSARO_PROXY||!PG_PAGE)return Promise.resolve([]);
  var qs=Object.keys(params||{}).map(function(k){return k+'='+encodeURIComponent(params[k]);}).join('&');
  var url=NONGSARO_PROXY.replace(/\/$/,'')+'/proxy/'+path+(qs?'?'+qs:'');
  return fetchWithTimeout(url,TIMEOUT_PROXY).then(function(r){return r.ok?r.text():'';}).then(function(txt){
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
/* ---- 로딩 단축: 모든 외부 호출에 시간 제한 ----
   "검색·노출·상세 사진 로딩이 너무 길다"는 지적을 실측해보니, 위 산림청
   사례처럼 타임아웃 없는 일반 fetch()가 코드 곳곳(위키·iNaturalist·GBIF·
   수피·농사로 프록시·정적 데이터셋)에 그대로 남아 있었다. 이 소스들은
   Promise.all로 여러 개씩 묶여 있어, 그중 단 하나만 응답이 느려도(대부분
   해외 공개 API라 응답 속도가 들쭉날쭉함) 이미 준비된 나머지 결과까지
   함께 발이 묶였다. 아래 네 값으로 용도별 상한선을 통일해 모든 fetch를
   감싼다 - "핵심 검색 결과(정부 API)"는 조금 더 기다려주고, "있으면 좋은
   보강 자료(사진 등)"는 짧게 끊어서 화면이 그 자료 하나 때문에 밀리지
   않게 한다. */
var TIMEOUT_GOV=8000;    /* 정부 API(도감·표본 등 핵심 검색 결과) */
var TIMEOUT_PROXY=4000;  /* 농사로 Cloudflare 프록시 경유 호출 */
var TIMEOUT_STATIC=6000; /* 페이지 로드 시 1회만 받는 정적 데이터셋/색인 */
var TIMEOUT_PHOTO=3000;  /* 위키·iNaturalist·GBIF·수피 등 사진 보강 소스(단발) */
var TIMEOUT_INAT_SEARCH=5000; /* iNaturalist를 검색 보충 소스로 쓸 때 */
var TIMEOUT_TRANSLATE=3000;   /* Pl@ntNet 영문 이름 한글 번역(MyMemory) */
/* 첫 호출이 실패/시간초과하면(=api.forest.go.kr가 이번 방문 세션 내내 응답을
   안 준다는 뜻일 가능성이 높음) 이후 상세창을 열 때마다 매번 3초씩 다시
   기다리지 않도록 회로차단기를 둔다. 한 번 성공하면 계속 정상 사용, 한 번
   실패하면 이 세션 동안은 즉시 건너뛴다(새로고침하면 다시 시도). */
var forestStoryBroken=false;
/* 예전엔 이 호출이 api.forest.go.kr을 클라이언트 노출 키(KEY)로 직접 때렸다 -
   PlantResource/odcloud/imageForest와 같은 문제(키 노출 + 남용 시 도감 전체
   장애)인데, 정작 nongsaro-proxy 워커에는 이미 /gov/forest-story 라우트가
   구현·배포까지 돼 있었고 아무도 호출을 안 하고 있었다. 그 기존 라우트로
   바꾼다(서버가 자기 시크릿으로 serviceKey를 채워 넣으므로 KEY를 안 보낸다). */
function fetchForestStory(nm){
  if(!nm||forestStoryBroken||!NONGSARO_PROXY)return Promise.resolve(null);
  var url=NONGSARO_PROXY+'/gov/forest-story/fStoryOpenAPI?searchWrd='+encodeURIComponent(nm)+'&numOfRows=1&pageNo=1';
  return fetchWithTimeout(url,2500).then(function(r){return r.ok?r.text():'';}).then(function(txt){
    if(!txt)return null;
    var xml=new DOMParser().parseFromString(txt,'text/xml');
    if(xml.querySelector('parsererror'))return null;
    /* 성공 코드가 '0000'인 줄 알고 그렇게만 검사했는데, 실제 응답은 '00'
       (다른 농사로/산림청 API들과 같은 두 자리 코드)이었다 - 그래서 이
       엔드포인트는 http 스킴 문제가 고쳐진 뒤에도 매번 조용히 null을
       반환했다(fsstory 필드 문제와는 별개의 버그). 실측값 그대로 맞춘다. */
    var rc=xml.querySelector('resultCode');
    if(rc&&rc.textContent.trim()!=='00')return null;
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
    /* fsstory 필드는 이름과 달리 실제 서술이 아니라 "09/07/10" 같은 등록일
       값만 들어있다(여러 종으로 실측 확인) - 지금까지 이 필드를 본문으로
       써온 탓에 진짜 유래 서술(fsoffer, 예: 은행나무 "열매가 살구 비슷하게
       생겼다 하여...")은 한 번도 노출되지 않고, 매번 fsguide(짧은 분류 한
       줄)로만 대체 표시되고 있었다. fsoffer를 본문으로 쓰고, fsguide는
       분류 행으로 따로 보여준다. */
    var story=(o.fsoffer||'').trim();
    var rows=[];
    pushRow(rows,'영명',o.fsename);
    pushRow(rows,'분류',o.fsguide);
    pushRow(rows,'서식장소',o.fsinhabit);
    pushRow(rows,'식물의 일생',o.fslifetime);
    if(!rows.length&&!story)return '';
    return uiSection('숲이야기 · 산림청(산림문화·휴양정보)',uiBody(story)+uiRows(rows));
  }).catch(function(){return '';});
}
/* 워커에는 TourAPI(한국관광공사) 라우트(/tourapi/*)가 forest-story와 같은
   TOURAPI_SERVICE_KEY로 이미 살아있었는데 프론트엔드 어디서도 부르지 않았다.
   국명으로 키워드 검색해 관광지(contentTypeId=12)만 추려 "이 식물을 만날 수
   있는 곳"으로 노출한다 - 나머지 콘텐츠 섹션과 같은 원칙대로, 실제로 매칭된
   장소가 없으면 섹션 자체를 아예 숨긴다(빈 섹션을 보여주지 않는다). */
var TOUR_SPOT_BROKEN=false;
function fetchTourSpots(nm){
  if(!nm||TOUR_SPOT_BROKEN||!NONGSARO_PROXY)return Promise.resolve([]);
  var url=NONGSARO_PROXY+'/tourapi/searchKeyword2?keyword='+encodeURIComponent(nm)+'&contentTypeId=12&numOfRows=6&pageNo=1';
  return fetchWithTimeout(url,3000).then(function(r){return r.ok?r.json():null;}).then(function(data){
    var body=data&&data.response&&data.response.body;
    var items=body&&body.items&&body.items.item;
    if(!items)return[];
    if(!Array.isArray(items))items=[items];
    return items.filter(function(it){return it&&it.title;}).slice(0,3);
  }).catch(function(){TOUR_SPOT_BROKEN=true;return[];});
}
/* [2026-09-19, 백로그 38 P1-I] 사진이 없는 장소가 4:3 회색 상자 + 깨진
   아이콘으로 나와 "오류"처럼 보인다는 대표 제보(맥문동 "상주 맥문동 솔숲"
   등) 대응. 처음엔 사진 유무로 썸네일행/텍스트행 두 그룹으로 나눴었는데,
   비즈니스 세션 390px 정밀진단(팝업-UX-진단-2026-09-19.md, I항)을 반영해
   전부 같은 높이의 한 줄 행(사진 있으면 64×64 왼쪽 썸네일, 없으면 텍스트만)
   으로 통일 - 순서가 섞이지 않고 목록으로 스캔하기 쉽다. 각 행은 정원 지도로
   이어지는 딥링크(/garden-map?q=)를 달아, "오류로 보이던 화면"을 "지도로
   가는 길"로 바꾼다. 사진 URL은 있는데 로드 자체가 실패하면(tong.visitkorea
   타임아웃 등) onerror에서 그 img만 지워 행이 자동으로 텍스트행으로
   내려앉는다(래퍼를 새로 안 만들어도 flex 자식이 하나 줄 뿐이라 레이아웃이
   깨지지 않는다). */
function tourSpotsHtml(nm){
  return fetchTourSpots(nm).then(function(items){
    if(!items.length)return'';
    var rows=items.map(function(it){
      var img0=toHttps(it.firstimage);
      var addr=[it.addr1,it.addr2].filter(Boolean).join(' ');
      var href='/garden-map?q='+encodeURIComponent(it.title||nm);
      var thumb=img0?('<img src="'+esc(img0)+'" style="width:64px;height:64px;object-fit:cover;flex-shrink:0;opacity:0;transition:opacity .25s" loading="lazy" onload="this.style.opacity=1" onerror="this.remove()">'):'';
      return '<a href="'+esc(href)+'" style="display:flex;align-items:center;gap:12px;min-height:56px;padding:10px 0;border-bottom:1px solid #E6E6E6;text-decoration:none;color:inherit;box-sizing:border-box">'
        +thumb
        +'<span style="flex:1;min-width:0">'
        +'<span style="display:block;font-size:15px;line-height:1.4;font-weight:600;color:#121212;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(it.title)+'</span>'
        +(addr?'<span style="display:block;font-size:11px;line-height:1.4;color:#6E6E6E;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(addr)+'</span>':'')
        +'</span>'
        +'<span style="color:#ABABAB;font-size:16px;flex-shrink:0">›</span>' /* 아이콘 글자(화살표) - 텍스트 위계와 무관해 4단계 체계 밖에 둔다 */
        +'</a>';
    }).join('');
    var mapAll='<a href="/garden-map?q='+encodeURIComponent(nm)+'" style="display:block;text-align:center;padding:14px 0 0;font-size:11px;color:#0B5345;font-weight:600;text-decoration:none">지도에서 모두 보기 ›</a>';
    return uiSection('이 식물을 만날 수 있는 곳 · 대한민국 구석구석(한국관광공사)',rows+mapAll);
  }).catch(function(){return'';});
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
var nongsaroGeneralReady=null;
function loadNongsaroGeneral(){
  if(nongsaroGeneralReady)return nongsaroGeneralReady;
  if(!NONGSARO_PROXY){nongsaroGeneralReady=Promise.resolve({decor:[],make:[],video:[]});return nongsaroGeneralReady;}
  nongsaroGeneralReady=Promise.all([
    fetchNongsaroItems('flwrDecor/flwrDecorList',{numOfRows:100,pageNo:1}),
    fetchNongsaroItems('cateGardenMake/cateGardenMakeLst',{numOfRows:60,pageNo:1}),
    fetchNongsaroItems('indoorpsncpaMvpLctre/indoorpsncpaMvpLctreLst',{numOfRows:60,pageNo:1})
  ]).then(function(res){
    return {decor:res[0]||[],make:res[1]||[],video:res[2]||[]};
  }).catch(function(){return {decor:[],make:[],video:[]};});
  return nongsaroGeneralReady;
}
/* 사진이 있는 카드와 없는 카드가 섞이면(예: 꽃장식은 사진, 좋아하는 꽃은 사진
   없음) 그리드 리듬이 깨진다 - 사진 없을 때도 다른 곳(#pdimg 등)과 같은
   PLACEHOLDER_ICON을 같은 비율 박스 안에 넣어 칸 높이를 통일한다. */
/* 라디우스는 기본 0(각진 에디토리얼 톤)이 실제 브랜드 원칙 - 필터
   칩·CTA에만 완전필(14px/80px)을 예외로 쓰는 방식이라, 일반 콘텐츠 카드에는
   라디우스를 넣지 않는다(디자인 진단 세션이 실제 임베드로 확인). 동영상강좌
   (kind==='video')만 재생 아이콘을 얹는다 - "영상이라는 게 실제로 다른
   정보"이기 때문이지 장식이 아니다(사진·영상이 섞인 그리드에서 지금 이게
   재생되는 콘텐츠인지 구분이 안 됐다). */
function pgcCard(it,kind){
  var src=toHttps(it.imgUrl||it.imageFileUrl);
  var playBadge=kind==='video'?'<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none"><div style="width:36px;height:36px;border-radius:50%;background:rgba(18,18,18,.55);display:flex;align-items:center;justify-content:center"><svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg></div></div>':'';
  var img='<div style="position:relative;width:100%;aspect-ratio:4/3;background:#F2F2F2;overflow:hidden;margin-bottom:6px;display:flex;align-items:center;justify-content:center">'
    +(src?'<img src="'+esc(src)+'" style="width:100%;height:100%;object-fit:cover" loading="lazy">':PLACEHOLDER_ICON)
    +playBadge
    +'</div>';
  var label=it.cntntsSj||'';
  return '<div>'+img+'<p style="font-size:11px;color:#121212;margin:0;line-height:1.6">'+esc(label)+'</p></div>';
}
function pgcGroup(title,items,kind){
  if(!items.length)return'';
  return (title?'<p style="font-size:11px;font-weight:600;color:#787878;margin:0 0 10px">'+esc(title)+'</p>':'')
    +'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:18px">'
    +items.map(function(it){return pgcCard(it,kind);}).join('')+'</div>';
}
/* 상세창(정원 가이드 탭)에 이어붙일 조각을 만든다 - nm(국명)과 colors(꽃 색상
   배열)에 실제로 매칭되는 항목이 하나도 없으면 빈 문자열을 돌려주고, 그러면
   호출부에서 이 섹션 자체가 화면에 나타나지 않는다. */
/* 국명 전체가 콘텐츠 제목에 그대로 들어있는 경우만 잡으면 "덩굴장미"처럼
   [수식어+기본명] 복합 국명이 "장미코사지 만들기"(기본명 "장미"만 포함) 같은
   글과 매칭되지 않는다.
   예전엔 전체 일치가 없으면 앞에서부터 아무 글자나 한 자씩 잘라가며 남는
   부분으로 재시도했다 - "정확한 데이터만 신뢰" 원칙과 안 맞았다: 잘라낸
   조각이 실제 수식어라는 근거가 없어, 우연히 다른 뜻의 짧은 문자열과
   겹치면 무관한 콘텐츠를 끌어올 위험이 있었다(예: 2글자까지 자르면 흔한
   음절 조합이 의미 없이 일치할 수 있다). 대신 국명에 실제로 쓰이는
   수식어(크기·색·자생지·형태·원산지)만 정해두고, 그 목록에 있는 접두어를
   정확히 뗀 나머지로만 재시도한다 - 근거 없는 부분일치를 만들지 않는다.
   이중 수식어(예: "미국개기장")에 대비해 최대 두 번까지 뗀다. */
var NAME_MODIFIER_PREFIXES=[
  '애기','각시','각씨','아기','좀','민','섬','왕','큰','참','개','돌','털',
  '산','들','물','갯','메','묏','실',
  '흰','붉은','노랑','자주','검은','푸른',
  '겹','홑','반겹',
  '덩굴','넝쿨','좁은잎','넓은잎','둥근잎',
  '야생','재배',
  '미국','중국','일본','유럽','서양','양','대만','인도','호주','아프리카','열대'
];
function stripKnownModifier(nm){
  for(var i=0;i<NAME_MODIFIER_PREFIXES.length;i++){
    var p=NAME_MODIFIER_PREFIXES[i];
    if(nm.length>p.length+1&&nm.indexOf(p)===0)return nm.slice(p.length);
  }
  return null;
}
function nongsaroNameMatch(list,nmClean){
  if(!nmClean)return[];
  var exact=list.filter(function(it){return (it.cntntsSj||'').indexOf(nmClean)!==-1;});
  if(exact.length)return exact;
  var tries=[stripKnownModifier(nmClean)];
  if(tries[0])tries.push(stripKnownModifier(tries[0]));
  for(var i=0;i<tries.length;i++){
    var core=tries[i];
    if(!core)continue;
    var m=list.filter(function(it){return (it.cntntsSj||'').indexOf(core)!==-1;});
    if(m.length)return m;
  }
  return[];
}
/* [2026-09-18] "좋아하는 꽃"(preferenceFlower) 섹션을 뺐다 - 이 API는 색상
   계열(7~8종) 말고는 식물과 아무 연결고리가 없는 "꽃 배달 무드 추천" 콘텐츠라,
   같은 색으로 묶이는 식물이면(예: 돌콩 같은 콩과 야생초까지) 전부 똑같은 장미
   사진·문구를 보여줬다("가드닝 콘텐츠가 다 똑같다" 실사용 제보로 발견) - 이
   식물에 대한 정보가 아니라 우연히 같은 색상 버킷에 들어간 것일 뿐이었다.
   "정확한 데이터만 신뢰" 원칙에 맞지 않아 매칭 로직을 고치는 대신 아예 뺀다. */
function nongsaroGeneralHtml(nm){
  return loadNongsaroGeneral().then(function(all){
    var nmClean=(nm||'').trim();
    var decorM=nongsaroNameMatch(all.decor,nmClean);
    var makeM=nongsaroNameMatch(all.make,nmClean);
    var videoM=nongsaroNameMatch(all.video,nmClean);
    var decorTop=decorM.slice(0,3);
    /* flwrDecorList(목록)에는 imgUrl 계열 필드가 아예 없어 사진 없이 제목만
       나오는 게 문제였다 - cateGardenMake/indoorpsncpaMvpLctre는 목록 자체에
       이미지가 있어 그대로 쓰지만, decor만 상세 API(flwrDecorDtl)를 한 번 더
       불러 imgUrl1을 채워야 pgcCard의 사진 렌더링이 실제로 동작한다. */
    return Promise.all(decorTop.map(function(it){
      return fetchNongsaroItems('flwrDecor/flwrDecorDtl',{cntntsNo:it.cntntsNo}).then(function(items){
        var d=items[0];
        if(d&&d.imgUrl1)it.imgUrl=d.imgUrl1;
        return it;
      }).catch(function(){return it;});
    })).then(function(){
      var body=pgcGroup('꽃장식과 정원 꾸미기',decorTop,'decor')
        +pgcGroup('실내정원 만들기',makeM.slice(0,3),'make')
        +pgcGroup('실내정원 동영상강좌',videoM.slice(0,2),'video');
      if(!body)return'';
      return uiSection('가드닝 콘텐츠 · 농사로(농촌진흥청)',body);
    });
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
    .map(function(u){return {url:toHttps(u),credit:'사진 · 농사로(농촌진흥청) 실내정원용 식물'};});
}
function nongsaroHerbWeedPhotos(sciNm){
  var clean=cleanSciName(sciNm).toLowerCase(),out=[];
  var h=NONGSARO_HERB[clean];
  if(h){for(var i=1;i<=6;i++){var u=h['imgUrl'+i];if(u)out.push({url:toHttps(u),credit:'사진 · 농사로 민간약초정보'});}}
  var w=NONGSARO_WEED[clean];
  if(w&&w.imgUrl)out.push({url:toHttps(w.imgUrl),credit:'사진 · 농사로 잡초정보'});
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
/* 정부 이미지 서버(forest.go.kr·nongsaro.go.kr·tong.visitkorea.or.kr 등)가
   http://로 URL을 내려줄 때가 있다 - https 페이지에서 혼합 콘텐츠 경고가
   뜬다(크롬은 자동 업그레이드하지만 전 브라우저가 그런 건 아니다). 사진
   URL을 쓰는 자리마다 각자 따로 고치다가 한 곳(TourAPI)만 고치고 똑같은
   문제가 있는 다른 곳(농사로 콘텐츠 카드, 수피 사진)을 빠뜨린 적이 있어서,
   이제 이 헬퍼 하나로 통일한다. */
function toHttps(u){return (u||'').replace(/^http:\/\//,'https://');}

/* "학명은 기울임이 있는 것은 그대로 반영해줘" 대응 - 지금까지는 학명이 표시되는
   모든 자리(#pdsci, 카드의 .pc-sci, 비교표)에 CSS font-style:italic을 문자열
   전체에 그대로 걸어서, 국제식물명명규약상 이탤릭이 아니어야 하는 부분(작은
   따옴표로 묶인 품종명, 잡종기호 ×, 명명자 인용 - 괄호 안팎의 사람 이름·
   출판연도·& 기호 등)까지 몽땅 기울어져 보였다. 실제 규약대로 속명+종소명
   (그리고 var./subsp./f. 뒤에 오는 종하 계급 학명)만 기울이고 나머지는
   정자로 남기도록, 문자열을 토큰 단위로 나눠 이탤릭 여부를 판단한다. */
var SCI_CONNECTORS={'var.':1,'subsp.':1,'ssp.':1,'f.':1,'forma':1,'subvar.':1,'cv.':1};
function sciNameHtml(sc){
  if(!sc)return'';
  var tokens=sc.match(/'[^']*'|\([^)]*\)|\S+/g)||[];
  var sawGenus=false,sawSpecies=false;
  return tokens.map(function(tok,i){
    var italic=false;
    var lower=tok.toLowerCase();
    if(/^'.*'$/.test(tok)||/^\(.*\)$/.test(tok)||tok==='×'){
      italic=false;
    } else if(!sawGenus&&/^[A-Z][a-z-]+\.?$/.test(tok)){
      italic=true;sawGenus=true;
    } else if(sawGenus&&!sawSpecies&&/^×?[a-z-]+$/.test(tok)){
      italic=true;sawSpecies=true;
    } else if(SCI_CONNECTORS[lower]){
      italic=false;
    } else if(i>0&&SCI_CONNECTORS[tokens[i-1].toLowerCase()]&&/^[a-z-]+$/.test(tok)){
      italic=true;
    } else {
      italic=false;
    }
    var e=esc(tok);
    return italic?('<i>'+e+'</i>'):e;
  }).join(' ');
}

function pSpin(on){
  var a=0,el=document.getElementById('pspin');
  if(pST)clearInterval(pST);
  if(on)pST=setInterval(function(){a+=8;if(el)el.style.transform='rotate('+a+'deg)';},30);
  else if(el)el.style.transform='';
}

function hideAll(){['pinit','pld','perr','pemp','pcnt','pgrid','pmorewrap','pindex'].forEach(function(id){var el=document.getElementById(id);if(el)el.style.display='none';});}
/* "검색이 느리다"는 지적의 상당 부분은 실제 지연이 아니라, 로딩 상태로
   바뀌는 순간 아무 표시 없이 화면이 뚝 끊기듯 바뀌는 데서 온다(#pld를
   display:none↔block으로 즉시 전환). 스피너를 키우고 포인트 그린으로
   바꾸고, 나타날 때 페이드인시킨다 - "진행 중"은 실제로 의미 있는 임시
   상태라 포인트 컬러를 쓴다(선택 상태에만 쓴다는 원칙과 같은 맥락: 지금
   이 순간에만 해당하는 강조). */
function pEnsureSpinStyle(){
  var el=document.getElementById('pspin');
  if(!el||el.dataset.styled)return;
  el.dataset.styled='1';
  el.style.width='28px';el.style.height='28px';el.style.borderWidth='2px';
  el.style.borderColor='#E6E6E6';el.style.borderTopColor='#0B5345';
}
/* [2026-09-19 UX 미세점검 B6] 캐시 적중 검색은 66~80ms 안에 끝나는데 그
   짧은 순간에도 "검색 중…" 스피너가 뜨자마자 사라져 번쩍였다(실측). 150ms
   이상 걸릴 때만 보이게 지연 표시한다 - hideAll()로 이전 화면(결과·오류
   등)을 지우는 건 그대로 즉시 하고, 스피너/문구만 늦춘다. hideLoading이
   150ms 안에 불리면 아예 안 뜬 채로 취소된다. */
var pShowLoadingTimer=null;
function showLoading(){
  hideAll();
  clearTimeout(pShowLoadingTimer);
  pShowLoadingTimer=setTimeout(function(){
    var pld=document.getElementById('pld');
    if(pld){
      pEnsureSpinStyle();
      pld.style.transition='opacity .25s ease';
      pld.style.opacity='0';
      pld.style.display='block';
      requestAnimationFrame(function(){pld.style.opacity='1';});
    }
    pSpin(true);
  },150);
}
function hideLoading(){
  clearTimeout(pShowLoadingTimer);
  pSpin(false);
  var pld=document.getElementById('pld');
  if(pld){pld.style.display='none';pld.style.opacity='';}
}
function showError(msg){hideLoading();hideAll();if(typeof pClearPhotoNote==='function')pClearPhotoNote();if(typeof pUpdateClearBtn==='function')pUpdateClearBtn();document.getElementById('perrmsg').textContent=msg;document.getElementById('perr').style.display='block';}

/* XML 대신 JSON으로 통신 (data.go.kr 표준 파라미터 _type=json 사용; returnType=json은
   이 API에서 작동하지 않음을 실측으로 확인함). JSON 파싱이 DOMParser보다 가볍고 코드도 간결해짐. */
function fetchJson(url,ms){
  return new Promise(function(resolve,reject){
    var c=new AbortController();
    var t=setTimeout(function(){c.abort();reject(new Error('시간 초과'));},ms||TIMEOUT_GOV);
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
/* [2026-09-19 정밀진단] raw.githubusercontent.com은 CDN이 아니다(Cache-Control:
   no-store로 항상 재다운로드·gzip 압축 없음·GitHub 공식적으로 대량 트래픽에
   비권장). 실측: plant_species_detail.json 8.8MB를 매 방문마다 압축 없이
   raw로 받고 있었다(직접 fetch 3.86s). jsdelivr(@main, GitHub 파일을 그대로
   미러링)로 바꾸면 gzip 압축+글로벌 엣지+브라우저 7일 캐시(바이트 동일 확인
   완료) - 첫 방문도 더 빠르고(콜드 fetch 2.06s), 재방문은 사실상 0ms/0바이트.
   이 데이터가 상세창 열기(pDetail)·검색 소스 중 하나(searchByFamily)를
   막고 있어(staticDataReady를 기다림) 로딩 체감 속도에 직접 영향을 준다. */
var STATIC_NAME_URL='https://cdn.jsdelivr.net/gh/thegardenedition/plant-guide-assets@main/plant_name_master.json';
var STATIC_SPECIES_URL='https://cdn.jsdelivr.net/gh/thegardenedition/plant-guide-assets@main/plant_species_detail.json';
var STATIC_NAME={},STATIC_SPECIES={};
function loadStaticTable(url,dest){
  if(!url)return Promise.resolve();
  return fetchWithTimeout(url,TIMEOUT_STATIC).then(function(r){return r.ok?r.json():null;}).then(function(t){
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
   GitHub(thegardenedition/plant-guide-assets)에 업로드해 jsdelivr(@main)로
   서빙한다(위 STATIC_NAME/SPECIES와 동일한 이유 - raw.githubusercontent.com은
   캐시·압축이 없어 2026-09-19 정밀진단으로 jsdelivr로 옮겼다).
   - 형태·질감·색으로 찾는 우리꽃 정원식물(3권, 총 450종) → 학술정보 탭
     (자생환경·국명유래·학명유래 등 분류학적 서술 중심), 국명/학명 유래가
     있는 종은 "스토리" 필터(pFilter.story)에도 매치된다(bookHasStory 참고).
   - 우리꽃으로 만드는 정원식물도감(텃밭·약초·실내·빗물·옥상·학교정원, 108종)
     → 정원 가이드 탭(자생지·식재·관리·증식 등 실제 재배 정보 중심)
   - 숲정원을 위한 식물 300종(248종) → 조경 스펙 탭(토성·광조건·내한성 표와
     재배품종 서술 중심) */
var BOOK_FTC_URL='https://cdn.jsdelivr.net/gh/thegardenedition/plant-guide-assets@main/book_form_texture_color.json';
var BOOK_GARDEN_URL='https://cdn.jsdelivr.net/gh/thegardenedition/plant-guide-assets@main/book_garden_encyclopedia.json';
var BOOK_FOREST300_URL='https://cdn.jsdelivr.net/gh/thegardenedition/plant-guide-assets@main/book_forest_garden_300.json';
var BOOK_FTC={},BOOK_GARDEN={},BOOK_FOREST300={};
/* BOOK_FTC는 학명 하나당 한 행만 남기므로(loadStaticTable이 같은 키를 덮어씀),
   세 책(형태/질감/색) 중 두 책 이상에 같은 종이 나오면 먼저 읽힌 축 정보가
   사라진다(표시용으로는 문제없었지만 "형태·질감·색 색인" 필터는 세 축을 각각
   정확히 구분해야 하므로 별도로 축별 전체 정보를 보존하는 색인을 둔다). */
var BOOK_AXIS_INDEX={};
function loadBookAxisIndex(){
  return fetchWithTimeout(BOOK_FTC_URL,TIMEOUT_STATIC).then(function(r){return r.ok?r.json():null;}).then(function(j){
    if(!j||!j.fields||!j.rows)return;
    var f=j.fields,scIdx=f.indexOf('sc'),catIdx=f.indexOf('category'),axisIdx=f.indexOf('axis');
    j.rows.forEach(function(row){
      var key=cleanSciName(row[scIdx]||''),axis=row[axisIdx],cat=row[catIdx];
      if(!key||!axis||!cat)return;
      if(!BOOK_AXIS_INDEX[key])BOOK_AXIS_INDEX[key]={};
      BOOK_AXIS_INDEX[key][axis]=cat;
    });
  }).catch(function(){/* 실패해도 색인 필터만 조용히 빠지고 나머지 기능엔 영향 없음 */});
}
/* 색인(형태/질감/색) 필터의 옵션 값 - 첨부된 3권(형태로/질감으로/색으로 찾는
   우리꽃 정원식물)이 실제로 쓰는 분류 용어를 그대로 가져온 것으로, 앱이 임의로
   지어낸 범주가 아니다. 질감은 요청대로 '고운/중간/거친' 대신 완전한 표현인
   '고운 질감/중간 질감/거친 질감'을 그대로 노출한다. */
var BOOK_FORM_OPTS=['수직형','구형','반구형','기본형','분산형','곡선형'];
var BOOK_TEXTURE_OPTS=['고운 질감','중간 질감','거친 질감'];
var BOOK_COLOR_OPTS=['빨간색','분홍색','주황색','노란색','초록색','보라색','흰색'];
var BOOK_COLOR_HEX={'빨간색':'#B1584F','분홍색':'#D2A6A0','주황색':'#C68F5E','노란색':'#D2BD7E','초록색':'#7C8B6F','보라색':'#8E7C93','흰색':'#EFEAE0'};
function bookAxisTag(sc,axis){
  var rec=BOOK_AXIS_INDEX[cleanSciName(sc||'')];
  return rec?(rec[axis]||null):null;
}
/* "우측 색인 중 클릭해도 값이 없는 건 빼야지" 대응 - 형태/질감/색 옵션
   목록(BOOK_FORM_OPTS 등)은 책의 목차를 그대로 옮긴 것이라, 실제 PDF
   표 추출 과정에서 특정 종의 분류값이 비어 있거나(예: 무릇 종의 category가
   빈 문자열로 확인된 사례) 목차상의 범주 하나가 실제로는 단 한 종도 채워지지
   않았을 수 있다. BOOK_AXIS_INDEX(책 3권 전체 색인)를 한 번 훑어 실제로
   1건 이상 존재하는 값만 옵션으로 남긴다 - 검색결과 유무가 아니라 데이터
   자체의 존재 여부이므로, 검색어와 무관하게 항상 같은 기준으로 걸러진다. */
function computeBookAxisAvailability(){
  var avail={form:{},texture:{},color:{}};
  Object.keys(BOOK_AXIS_INDEX).forEach(function(key){
    var rec=BOOK_AXIS_INDEX[key];
    if(rec.form)avail.form[rec.form]=true;
    if(rec.texture)avail.texture[rec.texture]=true;
    if(rec.color)avail.color[rec.color]=true;
  });
  return avail;
}
var bookDataReady=Promise.all([
  loadStaticTable(BOOK_FTC_URL,BOOK_FTC),
  loadStaticTable(BOOK_GARDEN_URL,BOOK_GARDEN),
  loadStaticTable(BOOK_FOREST300_URL,BOOK_FOREST300),
  loadBookAxisIndex().then(function(){
    /* 색인 데이터가 이제 막 도착했으므로, 그 사이 필터 패널이 이미 그려져
       있었다면(=BOOK_AXIS_INDEX가 비어 결과 0건인 옵션을 전혀 못 걸러낸
       상태로 렌더링됐다면) 한 번 더 그려서 실제 존재하는 옵션만 남긴다. */
    if(document.getElementById('pfform'))renderFilterPanel();
  })
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
/* [백로그 38 P2-C 요약 카드] 발간도서 3종 각각 height/bloom 필드가 있지만
   종마다 어느 책에 실렸는지 다르다(부분집합) - gardenHtml처럼 다시 HTML로
   렌더하지 않고 값만 뽑아, 있는 책 순서(정원식물도감→형태질감색→숲정원
   300종)대로 먼저 값이 있는 쪽을 쓴다. */
function bookSummaryFields(sc){
  return bookDataReady.then(function(){
    var key=cleanSciName(sc);
    if(!key)return {height:'',bloom:''};
    var ftc=BOOK_FTC[key],garden=BOOK_GARDEN[key],f300=BOOK_FOREST300[key];
    var height=(garden&&garden.height)||(ftc&&ftc.height)||(f300&&f300.heightM?f300.heightM+'m':'');
    var bloom=(garden&&garden.bloom)||(ftc&&ftc.bloom)||(f300&&f300.bloomTime)||'';
    return {height:height,bloom:bloom};
  }).catch(function(){return {height:'',bloom:''};});
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
  if(!PG_PAGE)return Promise.resolve();
  var url=NONGSARO_PROXY+'/gov/nature-image?page=1&perPage=5000';
  return fetchWithTimeout(url,TIMEOUT_STATIC).then(function(r){return r.ok?r.json():null;}).then(function(j){
    var rows=(j&&Array.isArray(j.data))?j.data:[];
    var seen={};
    rows.forEach(function(row){
      var sc=row['학명'],path=row['이미지파일경로'],kind=row['이미지종류'];
      if(kind!=='사진'||!sc||!path)return;
      var key=cleanSciName(sc).toLowerCase();
      if(!key)return;
      var httpsUrl=toHttps(path);
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
  return fetchWithTimeout(url,TIMEOUT_PHOTO).then(function(r){return r.ok?r.json():null;}).then(function(j){
    var t=j&&j.results&&j.results[0];
    if(!t)return null;
    if(t.iconic_taxon_name!=='Plantae')return null;
    if(String(t.name).toLowerCase()!==clean.toLowerCase())return null;
    var p=t.default_photo;
    if(!p||!p.license_code)return null;
    return {url:toHttps(p.medium_url||p.url),credit:(p.attribution_name?p.attribution_name+', ':'')+'CC '+p.license_code.replace('cc-','').toUpperCase()+' (iNaturalist)'};
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
  return fetchWithTimeout(url,TIMEOUT_PHOTO).then(function(r){return r.ok?r.json():null;}).then(function(j){
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
  return fetchWithTimeout(url,TIMEOUT_PHOTO).then(function(r){return r.ok?r.json():null;}).then(function(j){
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
  return fetchWithTimeout(url,TIMEOUT_PHOTO).then(function(r){return r.ok?r.json():null;}).then(function(d){
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
          return {url:toHttps(m.identifier),credit:'사진 · GBIF'+(holder?(' ('+holder+')'):'')};
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
  var u=NONGSARO_PROXY+'/gov/forest-image/getImageForestList?commonNm='+encodeURIComponent(korNm)+'&numOfRows=1&pageNo=1&_type=json';
  return fetchWithTimeout(u,TIMEOUT_PHOTO).then(function(r){return r.ok?r.json():null;}).then(function(j){
    var res=(j&&j.response)||{};
    if((res.header||{}).resultCode!=='00')return null;
    var items=(res.body&&res.body.items&&res.body.items.item)||null;
    var it=Array.isArray(items)?items[0]:items;
    if(!it||!it.photoFileUrl)return null;
    return {url:toHttps(it.photoFileUrl),credit:'수피 사진 · 산림청 국립수목원'+(it.photographingRgn?' ('+it.photographingRgn+')':'')};
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
  return fetchWithTimeout(url,TIMEOUT_PHOTO).then(function(r){return r.ok?r.json():null;}).then(function(j){
    var t=j&&j.results&&j.results[0];
    if(!t||t.iconic_taxon_name!=='Plantae')return [];
    if(String(t.name).toLowerCase()!==clean.toLowerCase())return [];
    var photos=(t.taxon_photos||[]).map(function(tp){return tp.photo;}).filter(function(p){return p&&p.license_code;});
    return photos.slice(0,8).map(function(p){
      return {url:toHttps(p.medium_url||p.url),credit:(p.attribution_name?p.attribution_name+', ':'')+'CC '+p.license_code.replace('cc-','').toUpperCase()+' (iNaturalist)'};
    });
  }).catch(function(){return [];});
}
function fetchGbifPhotos(sciNm){
  var clean=cleanSciName(sciNm);
  if(!clean)return Promise.resolve([]);
  var url='https://api.gbif.org/v1/occurrence/search?scientificName='+encodeURIComponent(clean)+'&mediaType=StillImage&limit=20';
  return fetchWithTimeout(url,TIMEOUT_PHOTO).then(function(r){return r.ok?r.json():null;}).then(function(d){
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
          out.push({url:toHttps(m.identifier),credit:'사진 · GBIF'+(holder?(' ('+holder+')'):'')});
        }
      });
    });
    return out.slice(0,8);
  }).catch(function(){return [];});
}
function fetchBarkPhotos(korNm){
  if(!korNm)return Promise.resolve([]);
  var u=NONGSARO_PROXY+'/gov/forest-image/getImageForestList?commonNm='+encodeURIComponent(korNm)+'&numOfRows=4&pageNo=1&_type=json';
  return fetchWithTimeout(u,TIMEOUT_PHOTO).then(function(r){return r.ok?r.json():null;}).then(function(j){
    var res=(j&&j.response)||{};
    if((res.header||{}).resultCode!=='00')return [];
    var items=(res.body&&res.body.items&&res.body.items.item)||null;
    var list=Array.isArray(items)?items:(items?[items]:[]);
    return list.filter(function(it){return it&&it.photoFileUrl;}).map(function(it){
      return {url:toHttps(it.photoFileUrl),credit:'수피 사진 · 산림청 국립수목원'+(it.photographingRgn?' ('+it.photographingRgn+')':'')};
    });
  }).catch(function(){return [];});
}
function dedupePhotos(list){
  var seen={},out=[];
  list.forEach(function(p){
    if(!p||!p.url)return;
    var url=toHttps(p.url);
    if(seen[url])return;
    seen[url]=true;
    out.push(url===p.url?p:Object.assign({},p,{url:url}));
  });
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
/* "사진이 늦게 나온다"는 지적 대응(커뮤니티 데이터처럼 국립수목원/농사로
   매칭이 없는 종에서 특히 심했다) - 예전에는 "느린 소스" 4개(위키·
   iNaturalist·GBIF·수피)를 Promise.all로 묶어, 그중 하나(예: 수피는 국명이
   있어야만 뜻이 있고, 위키는 동음이의 검증까지 거쳐 원래 느림)가 3초 타임아웃
   근처까지 가면 이미 훨씬 빨리 답한 GBIF/iNaturalist 사진까지 함께 3초 가까이
   묶여 있었다. 이제 6개 출처(국립수목원/농사로/위키/iNaturalist/GBIF/수피)를
   각각 독립적으로 요청해두고, 그중 아무거나 하나라도 도착하는 즉시
   onUpdate 콜백으로 그 시점까지 모인 사진을 신뢰도 순서(국립수목원 > 농사로 >
   위키 > iNaturalist > GBIF > 수피)로 합쳐 넘긴다 - 호출부(pDetail)가 매번
   그걸로 슬라이드를 다시 그려, 가장 먼저 답한 출처의 사진을 최대한 빨리
   보여주고 이후 더 신뢰도 높은 사진이 도착하면 자연스럽게 앞쪽으로 재정렬된다. */
function fetchAllPhotos(korNm,sciNm,onUpdate){
  var collected=[];
  function mergeInOrder(){
    var merged=[];
    for(var i=0;i<6;i++){if(collected[i])merged=merged.concat(collected[i]);}
    return dedupePhotos(merged).slice(0,12);
  }
  function addSource(rank,promise){
    return promise.then(function(list){
      collected[rank]=list||[];
      if(onUpdate)onUpdate(mergeInOrder());
    });
  }
  var done=Promise.all([
    addSource(0,fetchNatureImagePhotos(sciNm)),
    addSource(1,fetchNongsaroPhotoList(korNm,sciNm)),
    addSource(2,fetchWikiThumb('ko',korNm,sciNm).then(function(t){return t?[t]:[];})),
    addSource(3,fetchINatPhotos(sciNm)),
    addSource(4,fetchGbifPhotos(sciNm)),
    addSource(5,fetchBarkPhotos(korNm))
  ]);
  return {done:done,get:mergeInOrder};
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
/* "최대한 빠르게 노출" 요청 대응 - 예전에는 국립수목원 응답(naturePromise)이
   끝나야만(있으면 즉시, 없으면 null 확인 후) 나머지 소스(fallbackPromise)
   결과를 쓸 수 있었다. 두 프라미스의 실제 fetch 자체는 이미 동시에 시작되고
   있었지만, 화면 표시는 국립수목원 쪽이 "먼저 답해야" 진행되는 구조라, 국립
   수목원 인덱스(최초 1회, 5000행)가 늦게 도착하면 이미 훨씬 빨리 끝난 다른
   소스 결과까지 함께 묶여 늦게 노출됐다. 이제 둘 중 먼저 도착하는 결과를
   바로 화면에 쓰고("체감 속도"), 국립수목원 사진이 나중에 도착했는데 실제
   사진이 있으면(가장 신뢰도 높은 소스이므로) 조용히 교체해 최종 정확도는
   그대로 유지한다 - 국립수목원 인덱스가 이미 로드되어 있는 두 번째 검색부터는
   naturePromise 자체가 사실상 즉시 응답이라 교체가 거의 일어나지 않는다. */
/* [성능] 예전엔 농사로/위키/iNaturalist/GBIF 네 소스를 Promise.all로 묶어
   넷 다 끝날 때까지 기다린 뒤에야 그중 우선순위가 가장 높은 것 하나를
   썼다 - 가장 먼저 답한 소스가 이미 좋은 사진을 줬어도, 가장 느린 소스가
   끝날 때까지(각 3초 타임아웃, 일부는 순차 조회라 최대 6초 가까이) 화면엔
   아무것도 안 보였다. "화면에 바로 보이는 카드"(eager, 첫 화면 8장)조차
   이미지가 늦게 뜬다는 실사용 제보의 실제 원인(실측: 검색 11초 뒤에도 첫
   화면 8장 중 1장만 로드). 이제 우선순위 순서대로 한 소스씩 확정되는 대로
   검사해, 더 높은 우선순위 소스가 아직 안 끝났으면 기다리고(정확도 유지),
   거기까지 다 끝났는데 값이 있으면 나머지 느린 소스를 기다리지 않고 바로
   보여준다. */
function loadCardImage(korNm,sciNm,imgWrap,onDone,eager){
  var key=korNm+'|'+sciNm;
  if(pImgCache[key]!==undefined){
    applyThumb(imgWrap,pImgCache[key],eager);
    if(onDone)onDone(pImgCache[key]&&pImgCache[key].credit);
    return Promise.resolve();
  }
  var shown=false;
  function show(r){
    pImgCache[key]=r;
    applyThumb(imgWrap,r,eager);
    if(onDone)onDone(r&&r.credit);
  }
  var fallbackSources=[
    fetchNongsaroCardPhoto(korNm,sciNm),
    fetchWikiThumb('ko',korNm,sciNm),
    fetchINatPhoto(sciNm),
    fetchGbifPhoto(sciNm)
  ];
  var results=fallbackSources.map(function(){return undefined;});
  var fallbackSettled=false;
  function tryFallback(){
    if(fallbackSettled)return;
    for(var i=0;i<results.length;i++){
      if(results[i]===undefined)return; /* 이 우선순위가 아직 안 끝났으면 기다린다 */
      if(results[i]){
        fallbackSettled=true;
        if(!shown){shown=true;show(results[i]);}
        return;
      }
    }
    /* 여기 도달 = 네 소스 다 null - 마지막으로 수피 사진을 본다 */
    fallbackSettled=true;
    fetchBarkPhoto(korNm).then(function(r){if(!shown){shown=true;show(r);}});
  }
  var fallbackDone=Promise.all(fallbackSources.map(function(p,i){
    return p.then(function(r){results[i]=r||null;tryFallback();},function(){results[i]=null;tryFallback();});
  }));
  var natureDone=fetchNatureImagePhoto(sciNm).then(function(r){
    if(r){shown=true;show(r);} /* 국립수목원 사진은 늦게 와도 항상 우선 채택(정확도 유지) */
  });
  return Promise.all([natureDone,fallbackDone]).then(function(){});
}
function applyThumb(imgWrap,result,eager){
  if(!imgWrap||!imgWrap.isConnected)return;
  if(result&&result.url){
    var img=document.createElement('img');
    img.src=result.url;
    img.alt='';
    if(eager){img.loading='eager';img.setAttribute('fetchpriority','high');}
    else{img.loading='lazy';}
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
  var counterEl=null,prev=null,next=null;
  /* nudgePx: 첫 열림 스와이프 유도용 - idx 위치에서 몇 px 더 민 상태를 보여줄지(0=평상시) */
  function trackTransform(nudgePx){
    return 'translateX(calc(-'+(idx*100)+'% - '+(nudgePx||0)+'px))';
  }
  function update(){
    track.style.transform=trackTransform(0);
    if(creditEl){
      var c=photos[idx]&&photos[idx].credit;
      creditEl.textContent=c?'사진: '+c+' ('+(idx+1)+'/'+photos.length+')':'';
      creditEl.style.display=c?'block':'none';
    }
    if(counterEl)counterEl.textContent=(idx+1)+' / '+photos.length;
  }
  if(photos.length>1){
    /* [2026-09-19 UX 미세점검 C3] 화살표 32px는 탭하기 작고(44px 미달),
       점 인디케이터는 6px가 12개까지 늘어나면 탭도 안 되고 잘 읽히지도
       않았다. 화살표는 44px로 키우고(모바일은 스와이프로 충분해 숨김 -
       아래 mobile-only CSS), 점은 "n / 총n" 텍스트 카운터로 바꾼다. */
    prev=document.createElement('button');
    prev.type='button';prev.className='pd-slide-arrow';prev.innerHTML='&#10094;';prev.setAttribute('aria-label','이전 사진');
    prev.style.cssText='position:absolute;left:8px;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;border:none;background:rgba(18,18,18,.55);color:#fff;cursor:pointer;font-size:16px;line-height:1;display:flex;align-items:center;justify-content:center';
    prev.onclick=function(e){e.stopPropagation();idx=(idx-1+photos.length)%photos.length;update();};
    next=document.createElement('button');
    next.type='button';next.className='pd-slide-arrow';next.innerHTML='&#10095;';next.setAttribute('aria-label','다음 사진');
    next.style.cssText='position:absolute;right:8px;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;border:none;background:rgba(18,18,18,.55);color:#fff;cursor:pointer;font-size:16px;line-height:1;display:flex;align-items:center;justify-content:center';
    next.onclick=function(e){e.stopPropagation();idx=(idx+1)%photos.length;update();};
    wrap.appendChild(prev);wrap.appendChild(next);
    /* [디자인 세션 피드백 2026-09-19] 모바일은 화살표를 숨기므로(아래 mobile-only
       CSS) 사진이 여러 장이라는 단서가 카운터 텍스트뿐이라 - 반투명 칩으로 눈에
       띄게 하고, 사진 오른쪽 아래에 둔다. */
    counterEl=document.createElement('div');
    counterEl.style.cssText='position:absolute;bottom:10px;right:10px;background:rgba(0,0,0,.45);color:#fff;font-size:11px;font-weight:600;letter-spacing:.3px;padding:3px 9px;border-radius:10px;pointer-events:none';
    wrap.appendChild(counterEl);
    var startX=null;
    wrap.addEventListener('touchstart',function(e){startX=e.touches[0].clientX;},{passive:true});
    wrap.addEventListener('touchend',function(e){
      if(startX==null)return;
      var dx=e.changedTouches[0].clientX-startX;
      if(Math.abs(dx)>40){if(dx<0)next.onclick(e);else prev.onclick(e);}
      startX=null;
    });
    /* [디자인 세션 피드백] 첫 열림에 한 번, 다음 사진이 살짝(10px) 비쳤다
       돌아오게 해서 "스와이프할 수 있다"는 걸 넌지시 알려준다 - 사용자가
       이미 넘겼으면(idx변화) 하지 않는다. */
    if(!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion:reduce)').matches)){
      setTimeout(function(){
        if(idx!==0)return;
        track.style.transform=trackTransform(10);
        setTimeout(function(){
          if(idx===0)track.style.transform=trackTransform(0);
        },400);
      },500);
    }
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
function deriveUseCategory(item,attrs,shpe,grwOverride,famOverride,dstrbOverride){
  var grw=grwOverride!=null?grwOverride:val(item,'grwEvrntDesc');
  /* dstrbOverride가 없으면(호출부를 아직 안 고친 다른 자리) 예전처럼 item
     원본의 dstrb 필드만 본다 - "정원 정보로 찾기"(runFacetSearch)가 쓰는
     buildStaticIndex 경로에서는 item이 {plantGnrlNm:korNm} 뿐이라 item.dstrb가
     항상 빈 문자열이었다. curationTags에는 정적 데이터로 보강한 dstrb를 이미
     넘기면서 정작 이 함수에는 안 넘겨, "남부수종" 칩(SOUTHERN_RE가 이 dstrb를
     봄)이 실제로는 늘 빈 텍스트만 검사해 항상 0건이었다(deriveCuratedProfile의
     주석엔 "dstrb도 넘긴다"고 되어 있었지만 실제 호출부엔 빠져 있던 버그). */
  var note=val(item,'note'),dstrb=dstrbOverride!=null?dstrbOverride:val(item,'dstrb');
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
  /* 예전엔 hardiness==='제한적 노지'(내한성 부족) 조건까지 함께 요구했는데,
     hardiness는 국내 분포 서술(dstrb)에 "한국/전국"이 없으면 정보 부족으로도
     기본값이 '제한적 노지'가 되는 반면, 정작 SOUTHERN_RE가 찾는 "남부/제주/
     남해안" 언급은 원산지가 아니라 국내 자생 지역을 설명하는 문장에만 나온다
     - 두 조건이 동시에 성립하는 경우가 사실상 없어(실측: 3.6만종 전체에서
     0건) 이 칩을 눌러도 항상 결과가 없었다. 국내 남부/제주/남해안 자생·분포
     언급이 있으면 그 자체로 남부수종으로 충분히 판단할 수 있으므로 내한성
     조건을 뗀다. */
  if(SOUTHERN_RE.test(dstrb||''))cats.push('남부수종');
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
  attrs.useCats=deriveUseCategory(item,attrs,shpe,grw,fam,dstrb);
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
/* [디자인 토큰 시범 적용] 지금까지 이 앱은 흑백회 뿐이고 실제 브랜드 포인트
   그린(#0B5345)은 어디에도 안 쓰이고 있었다 - "선택된 상태"처럼 사용자가
   고른 값 하나를 짚어주는 자리에만 그린을 쓰고, 본문 텍스트·구조색(#121212/
   #E6E6E6 등)은 그대로 둔다("무채색 + 포인트 그린 단 하나" 원칙, 대표 확정). */
var ACCENT='#0B5345';
/* [백로그 38 P2-G] 흰 테두리 버튼 3개가 "눌러도 되는 것처럼" 보인다는 지적
   (진단 문서 - 실제로는 상태 표시일 뿐 클릭해도 아무 일도 안 일어남).
   모바일에서는 선택 안 된 옵션을 숨기고 선택된 값 하나만 초록 칩으로 보여준다
   (.env-opt-active만 남기는 CSS, pEnsurePovAnimStyle 참고) - 그러려면 활성/
   비활성 여부를 class로도 표시해둬야 CSS가 골라낼 수 있다. 데스크톱은 기존
   3버튼 스케일을 그대로 유지(골격 유지 원칙). */
function envBarHtml(label,options,active){
  return '<div class="env-bar" style="margin-bottom:20px">'
    +'<p style="font-size:11px;letter-spacing:1px;color:#ABABAB;margin:0 0 8px">'+esc(label)+'</p>'
    +'<div style="display:flex;gap:6px">'
    +options.map(function(o){var on=(o===active);return '<span class="'+(on?'env-opt env-opt-active':'env-opt')+'" style="flex:1;text-align:center;padding:8px 0;font-size:11px;letter-spacing:.2px;border:1px solid '+(on?ACCENT:'#E6E6E6')+';background:'+(on?ACCENT:'#fff')+';color:'+(on?'#fff':'#ABABAB')+'">'+esc(o)+'</span>';}).join('')
    +'</div></div>';
}
/* [백로그 38 P2-C] 헤더 바로 아래 "스크롤 없이 보이는 첫 화면" 요약 카드 -
   햇빛·물·다 자란 높이·개화기·난이도 중 값이 있는 것만 가로 스크롤 칸으로
   보여준다(값 없는 항목은 아예 안 그림 - 빈 칸을 보여주는 것보다 나음).
   출처가 서로 달라(광조건/수분은 정적 데이터셋 기반 curated profile, 키/
   개화기는 발간도서 3종, 난이도는 농사로 실내정원 목록) 하나도 없는 종도
   있을 수 있다 - 그럴 땐 카드 자체를 안 그린다. */
var SUMMARY_ITEMS=[
  {key:'sunlight',icon:'☀',label:'햇빛'},
  {key:'moisture',icon:'💧',label:'물'},
  {key:'height',icon:'📏',label:'키'},
  {key:'bloom',icon:'🌸',label:'개화기'},
  {key:'level',icon:'⚙',label:'난이도'}
];
function pdSummaryHtml(values){
  var items=SUMMARY_ITEMS.filter(function(it){return values&&values[it.key];});
  if(!items.length)return'';
  return '<div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;margin-bottom:20px">'
    +items.map(function(it){
      return '<div style="flex:0 0 auto;min-width:74px;text-align:center;background:#F8F8F8;border:1px solid #E6E6E6;padding:10px 8px">'
        +'<div style="font-size:16px;margin-bottom:4px;line-height:1">'+it.icon+'</div>' /* 아이콘 글자 - 4단계 체계 밖 */
        +'<div style="font-size:11px;color:#ABABAB;letter-spacing:.3px;margin-bottom:2px">'+esc(it.label)+'</div>'
        +'<div style="font-size:13px;font-weight:600;color:#121212;white-space:nowrap">'+esc(values[it.key])+'</div>'
        +'</div>';
    }).join('')+'</div>';
}
/* [백로그 38 P2-D] 코드에 "#pdpane-overview 하나만 남은 탭 구조 흔적"이라고
   불리던 #pdtabbar(정적 임베드에 이미 있는 빈 슬롯, 예전 탭 UI가 쓰던 자리)
   를 섹션 점프 칩으로 되살린다. 각 칩은 이미 존재하는 스켈레톤 슬롯 id를
   그대로 앵커로 쓴다(새 id를 붙일 필요 없음) - 그 슬롯이 비어 있어도
   scrollIntoView는 안전하게 동작한다(그 자리로 스크롤할 뿐). */
var PD_JUMP_SECTIONS=[
  {id:'pdsummary',label:'개요'},
  {id:'pdbody',label:'특징'},
  {id:'pdenv',label:'재배'},
  {id:'pdtourspots',label:'만날 곳'},
  {id:'pdacademic',label:'자료'}
];
function pdJumpChipsHtml(){
  return PD_JUMP_SECTIONS.map(function(s,i){
    return '<span class="pdjump-chip'+(i===0?' pdjump-active':'')+'" data-target="'+s.id+'" onclick="pdJumpTo(\''+s.id+'\')">'+esc(s.label)+'</span>';
  }).join('');
}
/* [백로그 38 P2-D 후속, 2026-09-19] 비즈니스 세션 390 실측으로 발견: 저장소
   embed-shell.html 137행엔 #pdtabbar가 있지만 실제 라이브 Webflow 임베드엔
   없다(백로그 27 편입 때 어긋난 것) - document.getElementById가 null을
   돌려줘 점프 칩이 통째로 안 그려졌다. Webflow 재발행 없이, 없으면 여기서
   직접 만들어 #pdpane-overview 앞에 끼워 넣는다(정본 마크업과 같은 자리). */
function pdEnsureTabbar(){
  var tb=document.getElementById('pdtabbar');
  if(tb)return tb;
  var pane=document.getElementById('pdpane-overview');
  if(!pane||!pane.parentNode)return null;
  tb=document.createElement('div');
  tb.id='pdtabbar';
  tb.style.cssText='display:flex;border-bottom:1px solid #E6E6E6;padding:0 20px;overflow-x:auto';
  pane.parentNode.insertBefore(tb,pane);
  return tb;
}
/* [백로그 38 P2-D 재수정, 2026-09-19] 비즈니스 세션 390 실측: smooth
   scrollIntoView가 두 가지로 어긋났다 - (1) 스크롤 60px 지점에서 헤더가
   122→56px로 줄며 레이아웃이 66px 이동해 목표 위치가 그새 바뀌고,
   (2) setEl의 K 레이아웃시프트 보정 같은 다른 프로그램적 스크롤이 끼면
   Chrome이 진행 중이던 smooth 스크롤을 취소한다(실측 확인: pdbody/pdenv
   점프가 아예 안 움직이거나 66px 어긋남). 컴팩트 상태를 먼저 강제로
   확정해 높이를 고정한 뒤, 헤더+칩바 높이만큼 오프셋을 주고 instant로
   scrollTop을 직접 설정한다(비즈니스 세션이 라이브에서 4/5 섹션 정확히
   칩 바 하단에 맞는 것까지 실측 검증). */
window.pdJumpTo=function(id){
  var el=document.getElementById(id),p=document.getElementById('pdpanel');
  if(!el||!p)return;
  var head=document.getElementById('pdhead'),tb=document.getElementById('pdtabbar');
  if(window.innerWidth<=640&&head)head.classList.add('pdhead-compact');
  var off=(head?head.getBoundingClientRect().height:0)+(tb?tb.getBoundingClientRect().height:0);
  p.scrollTop=el.offsetTop-off;
  el.classList.add('pd-revealed'); /* 칩으로 바로 점프한 섹션은 스크롤 이벤트를 기다리지 않고 즉시 표시(뜸들이지 않게) */
  pdSetActiveChip(id);
};
function pdSetActiveChip(id){
  var bar=document.getElementById('pdtabbar');
  if(!bar)return;
  Array.prototype.forEach.call(bar.querySelectorAll('.pdjump-chip'),function(c){
    c.classList.toggle('pdjump-active',c.getAttribute('data-target')===id);
  });
}
/* IntersectionObserver는 여러 섹션이 동시에 화면에 걸리면(짧은 섹션들)
   활성 칩이 부정확했다(실측: pdbody/pdacademic/pdtourspots로 점프해도
   "재배"에 계속 걸려있음) - 섹션이 5개뿐이라, 스크롤할 때마다 "칩 바
   하단을 이미 지난 마지막 섹션"을 직접 계산하는 쪽이 더 정확하고 가볍다.
   #pdpanel은 상세창을 열 때마다 새로 만들어지는 요소가 아니라 리스너를
   한 번만 건다(pBindHeadCompact와 같은 패턴). */
function pdBindJumpObserver(){
  var scroller=document.getElementById('pdpanel');
  if(!scroller||scroller.dataset.jumpScrollBound)return;
  scroller.dataset.jumpScrollBound='1';
  scroller.addEventListener('scroll',function(){
    var head=document.getElementById('pdhead'),tb=document.getElementById('pdtabbar');
    var threshold=scroller.scrollTop+(head?head.getBoundingClientRect().height:0)+(tb?tb.getBoundingClientRect().height:0)+8;
    var current=PD_JUMP_SECTIONS[0].id;
    PD_JUMP_SECTIONS.forEach(function(s){
      var el=document.getElementById(s.id);
      if(el&&el.offsetTop<=threshold)current=s.id;
    });
    pdSetActiveChip(current);
  },{passive:true});
}
/* [2026-09-20 고급 디자인 스킬 점검] 상세창 안의 섹션(재배 정보·조경 스펙 등)이
   스크롤해서 처음 보일 때 뚝 나타나던 걸 살짝 떠오르며 나타나게 한다(카드
   첫 등장 때와 같은 원리). IntersectionObserver를 쓰지 않는다 - 예전에
   "화면에 보이는 카드만" IntersectionObserver로 지연 로딩했다가 탭이
   백그라운드로 인식되는 상황 등에서 콜백이 아예 안 불려 영영 안 채워지는
   실사용 버그가 있었다(위 카드 로딩 부분 주석 참고) - 이미 이 파일에서
   검증된 순수 scroll 이벤트 방식(바로 위 pdBindJumpObserver와 같은 패턴)을
   그대로 쓴다. 리스너는 한 번만 걸되(#pdpanel은 상세창마다 새로 안 만들어짐),
   "지금 보이는 섹션 표시"는 상세창을 열 때마다(=매번) 다시 실행한다 -
   overviewSkeleton()이 매번 섹션 div를 새로 만들어서(pd-revealed 클래스
   없는 새 노드) 이전 식물을 보던 표시가 남아있을 걱정은 없다. */
function pdBindSectionReveal(){
  var scroller=document.getElementById('pdpanel');
  if(!scroller)return;
  var ids=['pdsummary','pdcore','pdenv','pdplanting','pdbody','pdlandscape','pdnsgarden','pdnslandscape','pdbookgarden','pdbooklandscape','pdacademic','pdtourspots','pdstory'];
  function reveal(){
    var top=scroller.getBoundingClientRect().top,bottom=scroller.getBoundingClientRect().bottom;
    ids.forEach(function(id){
      var el=document.getElementById(id);
      if(!el||el.classList.contains('pd-revealed'))return;
      var r=el.getBoundingClientRect();
      if(r.top<bottom-40&&r.bottom>top)el.classList.add('pd-revealed');
    });
  }
  if(!scroller.dataset.revealScrollBound){
    scroller.dataset.revealScrollBound='1';
    scroller.addEventListener('scroll',reveal,{passive:true});
  }
  reveal(); /* 지금 이미 화면에 걸쳐 있는 섹션은 스크롤 없이도 바로 보여야 한다 */
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
    +(tagsHtml?'<div style="margin:20px 0">'+tagsHtml+'</div>':'')
    +envBarHtml('내한성',['전국 노지','제한적 노지','실내 구성'],p.hardiness)
    +(p.story?'<p style="font-size:13px;color:#787878;line-height:1.8;margin:20px 0 0">'+esc(p.story)+'</p>':'');
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
  return ['pdsummary','pdcore','pdenv','pdplanting','pdbody','pdlandscape','pdnsgarden','pdnslandscape','pdbookgarden','pdbooklandscape','pdacademic','pdtourspots','pdstory']
    .map(function(id){return '<div id="'+id+'"></div>';}).join('');
}
/* [백로그 38 P1-K] 6개 출처가 제각각 도착할 때마다 그 결과를 담는 슬롯
   (setEl 호출 하나하나)이 본문 어딘가에서 갑자기 커진다 - 지금 읽고 있는
   자리보다 위쪽 슬롯이 나중에 채워지면 화면이 아래로 밀려 "팝업이
   이상하다"는 인상을 준다(진단 문서 1절 마지막 줄). 슬롯이 스크롤 위치보다
   위에 있을 때만, 채우기 전/후 높이 차이만큼 스크롤을 같이 밀어줘 화면에
   보이는 위치가 그대로 유지되게 한다(레이아웃 시프트 0). 슬롯이 지금 보이는
   화면 안이거나 아래쪽이면 보정하지 않는다 - 보고 있는 내용이 커지는 건
   정상적인 변화라 건드릴 이유가 없다. */
function setEl(id,html){
  var el=document.getElementById(id);
  if(!el)return;
  var scroller=document.getElementById('pdpanel');
  var beforeH=el.offsetHeight,wasAboveView=scroller&&el.offsetTop<scroller.scrollTop;
  el.innerHTML=html||'';
  pApplyClamps(el);
  if(wasAboveView){
    var delta=el.offsetHeight-beforeH;
    if(delta)scroller.scrollTop+=delta;
  }
}
/* 학명은 검색 결과에 항상 있어 즉시 채울 수 있지만, 과명·영명은 출처(도감/
   표본/정적 데이터셋)에 따라 조금 늦게 도착한다 - 도착하는 대로 다시 호출해도
   같은 슬롯을 덮어쓸 뿐이라 안전하다. */
/* [백로그 38 P2-C] 학명은 헤더(#pdsci)에 이미 나와 있어 여기서는 뺀다 -
   전엔 헤더 학명과 이 표의 학명이 그대로 중복이었다. 과명·영명만 남겨
   "작은 메타 줄"로 내린다. */
function setPdCore(sc,family,engNm){
  var rows=[];
  pushRow(rows,'과명',family);
  pushRow(rows,'영명',engNm);
  setEl('pdcore',rowsTable(rows));
}
/* "정원에 은은한 존재감을 더하는 식재" 같은 자동 생성 한 줄 태그라인은
   군더더기라는 지적에 따라 삭제 요청 - pdtagline 슬롯 자체를
   overviewSkeleton에서 없앴으므로 여기서도 채우지 않는다(식재 팁은 유지). */
function applyCuratedProfile(p){
  setEl('pdenv',p?envTripleHtml(p):'');
  setEl('pdplanting',(p&&p.plantingTip)?'<p style="font-size:13px;color:#121212;line-height:1.8;margin:0 0 20px"><span style="font-weight:600">식재 팁</span> · '+esc(p.plantingTip)+'</p>':'');
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
  var url=buildUrl('/plantPilbkInfo',{reqPlantPilbkNo:no});
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
/* [2026-09-19 UX 미세점검 A1] renderPage는 검색 소스 하나가 도착할 때마다
   (최대 9개 소스) pRenderGen을 다시 올린다 - 같은 검색 안에서도 카드가
   화면에 그대로 남아있는데 gen만 계속 바뀌는 것이다. 예전엔 이 gen이
   바뀌었다는 이유만으로 이미 큐에 들어간(아직 실행 전) 정원정보 요청을
   "낡았다"고 버리고 다시 큐에 넣지 않아, 소스가 여러 번 도착하는 동안
   먼저 대기열에 들어간 카드일수록 영영 응답을 못 받았다(실측: "분석 중
   (0/9)"·"(3/9)"에서 20~30초 멈춤). 진짜 "낡았다"의 기준은 gen 숫자가
   아니라 그 카드 DOM이 실제로 화면에서 떨어져 나갔는지(d.isConnected)다
   - 완전히 새 검색이면 renderPage가 g.innerHTML=''로 옛 카드를 실제로
   떼어내므로 isConnected가 자연히 false가 되고, 같은 검색 안의 소스
   도착만으로는 카드가 안 떨어지므로 계속 유효하다고 본다. */
function loadAndRenderAttrs(d,it){
  var key=attrsCacheKeyFor(it);
  /* 항목이 나중에 도감 상세(no)를 얻으면(승급) 캐시 키가 'u'+uid → no로
     바뀐다 - 옛 uid 키 아래 이미 데이터가 있으면 그대로 옮겨 쓴다. 안 옮기면
     (1) 이미 받은 데이터를 또 요청하고 (2) updateFilterProgress가 no 키만
     찾다가 "분석 중"에서 안 움직이는 것처럼 보인다. */
  if(!pAttrCache[key]&&it.no){
    var oldKey='u'+it._uid;
    if(pAttrCache[oldKey])pAttrCache[key]=pAttrCache[oldKey];
  }
  if(pAttrCache[key]){
    renderCardAttrs(d,pAttrCache[key]);
    it._attrsRich=isAttrsRich(pAttrCache[key]);
    reflowGrid();
    return;
  }
  var task=function(){
    if(!d.isConnected)return Promise.resolve(null); /* 카드가 실제로 화면에서 떨어져 나간 경우에만 건너뛴다 */
    return it.no?fetchPlantAttrs(it.no,it.sc):staticOnlyAttrs(it);
  };
  limitCard(task).then(function(attrs){
    if(attrs&&d.isConnected){
      renderCardAttrs(d,attrs); /* 기존 .pc-attrs 제거는 renderCardAttrs 안에서 항상 처리 */
    }
    it._attrsRich=isAttrsRich(attrs);
    applyFiltersThrottled();
    reflowGrid(); /* "정원 관련 식물 우선순위" - 용도/색상 등 정원 정보가 실제로 채워지면 순위 상승 */
    updateFilterProgress();
  });
}
/* "1순위 실내 정원 식물, 2순위 국립수목원+농촌진흥청 모두 있는 식물" 판정.
   실내정원 매칭(fetchGardenMatch)은 학명 검증을 위해 추가 조회가 필요할 수
   있어 비동기이지만, 후보 국명 217종에 없으면 즉시 null로 끝나 대다수 카드는
   추가 네트워크 요청이 붙지 않는다. 민간약초·잡초 매칭은 이미 메모리에 있는
   테이블(NONGSARO_HERB/WEED)이라 nongsaroDataReady 이후로는 즉시 판정된다.
   결과는 attrs 캐시와 같은 키로 캐시해 재계산을 막는다. */
var pGardenTierCache={};
/* d(카드 DOM)를 넘기면 "낡음" 판정을 d.isConnected로 한다(파일 위쪽 주석
   [2026-09-23 정밀진단] 참고) - renderPage/refreshCard 모두 카드 엘리먼트를
   들고 있으므로 항상 넘긴다. */
function loadGardenTier(it,d){
  var key=attrsCacheKeyFor(it);
  var cached=pGardenTierCache[key];
  if(cached){
    it._indoorGarden=cached.indoor;
    it._bothAgencies=cached.both;
    reflowGrid();
    return;
  }
  nongsaroDataReady.then(function(){
    if(d&&!d.isConnected)return null; /* 카드가 실제로 화면에서 떨어져 나간 경우에만 매칭 조회(fetchGardenMatch) 자체를 건너뛴다 */
    var clean=cleanSciName(it.sc||'').toLowerCase();
    var hasRda=!!(clean&&(NONGSARO_HERB[clean]||NONGSARO_WEED[clean]));
    it._bothAgencies=!!it.no&&hasRda;
    reflowGrid();
    return fetchGardenMatch(it.nm,it.sc);
  }).then(function(m){
    if(d&&!d.isConnected)return;
    it._indoorGarden=!!m;
    pGardenTierCache[key]={indoor:it._indoorGarden,both:it._bothAgencies};
    reflowGrid();
  }).catch(function(){
    if(d&&!d.isConnected)return;
    it._indoorGarden=false;
    if(it._bothAgencies===undefined)it._bothAgencies=false;
    reflowGrid();
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
/* [2026-09-19 UX 미세점검 A1] 기존 .pc-attrs 제거를 네트워크 경로(구
   loadAndRenderAttrs 1939행)에서만 했다 - 캐시 적중 경로(1923행)는 안 지우고
   그냥 append해, refreshCard가 같은 카드에 반복 호출될 때마다(승급마다) 칩
   줄이 쌓였다(실측: 칩 9개=3줄). 제거를 이 함수 안으로 옮겨 두 경로 모두
   항상 하나만 남게 한다. */
function renderCardAttrs(cardEl,attrs){
  var old=cardEl.querySelector('.pc-attrs');if(old)old.remove();
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
var pFilter={usecat:[],origin:[],color:[],form:[],texture:[],cycle:[],light:[],story:[],initial:null};
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
  /* 필터 칩을 눌러 결과가 바뀌는 순간에도 히스토리 체크포인트를 남긴다 -
     이게 없으면 필터만으로 찾다가 상세창을 열고 닫을 때(뒤로가기) 되돌아갈
     지점이 없어 맨 처음 빈 화면으로 튀어버린다("팝업 닫으면 엉뚱한 화면에서
     하단으로 나온다" 버그의 실제 발단 - 화면이 갑자기 훨씬 짧아지는 것도
     이 때문이었다). */
  pHistPushSearch();
  if(pQ)applyFilters();else runFacetSearch();
};
/* [2026-09-19 UX 미세점검 A4] 초기화 뒤에도 history.state.filter에 이전
   값이 남아있었다는 지적 - pHistPushSearch(pushState)는 매번 새 항목을
   쌓는데, 초기화는 "새로운 탐색 지점"이 아니라 지금 서 있는 자리를 그대로
   비우는 동작이라 replaceState가 더 맞다(현재 항목을 빈 필터로 덮어써,
   비어있지 않은 옛 상태가 history.state로 남을 여지 자체를 없앤다). */
window.pResetFilters=function(){
  pFilter={usecat:[],origin:[],color:[],form:[],texture:[],cycle:[],light:[],story:[],initial:null};
  renderFilterPanel();
  updateFilterBadge();
  if(!pSuppressHistory)history.replaceState({type:'search',q:pQ,filter:pFilterSnapshot()},'',location.href);
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
      colorEl=document.getElementById('pfcolor'),formEl=document.getElementById('pfform'),textureEl=document.getElementById('pftexture'),
      cycleEl=document.getElementById('pfcycle'),lightEl=document.getElementById('pflight'),
      storyEl=document.getElementById('pfstory');
  if(!usecatEl||!originEl||!colorEl||!formEl||!textureEl||!cycleEl||!lightEl||!storyEl)return;
  var cycleOpts=['한해살이','두해살이','여러해살이','목본'],lightOpts=['양지','반음지','음지'];
  function chip(kind,o){return '<span class="fchip'+(pFilter[kind].indexOf(o)!==-1?' active':'')+'" onclick="pToggleFilterVal(\''+kind+'\',\''+o+'\',this)">'+esc(o)+'</span>';}
  usecatEl.innerHTML=USECAT_OPTS.map(function(o){return chip('usecat',o);}).join('');
  originEl.innerHTML=ORIGIN_OPTS.map(function(o){return chip('origin',o);}).join('');
  cycleEl.innerHTML=cycleOpts.map(function(o){return chip('cycle',o);}).join('');
  lightEl.innerHTML=lightOpts.map(function(o){return chip('light',o);}).join('');
  storyEl.innerHTML=STORY_OPTS.map(function(o){return chip('story',o);}).join('');
  /* BOOK_AXIS_INDEX가 아직 비어 있으면(로딩 전) 결과 0건 여부를 판단할 수
     없으므로 전체 목록을 그대로 보여주고, 로드가 끝나면(bookDataReady 콜백이
     renderFilterPanel을 다시 호출) 실제 존재하는 값만 남긴다. */
  var bookAxisLoaded=Object.keys(BOOK_AXIS_INDEX).length>0;
  var bookAvail=bookAxisLoaded?computeBookAxisAvailability():null;
  var formOpts=bookAvail?BOOK_FORM_OPTS.filter(function(o){return bookAvail.form[o];}):BOOK_FORM_OPTS;
  var textureOpts=bookAvail?BOOK_TEXTURE_OPTS.filter(function(o){return bookAvail.texture[o];}):BOOK_TEXTURE_OPTS;
  var colorOpts=bookAvail?BOOK_COLOR_OPTS.filter(function(o){return bookAvail.color[o];}):BOOK_COLOR_OPTS;
  formEl.innerHTML=formOpts.map(function(o){return chip('form',o);}).join('');
  textureEl.innerHTML=textureOpts.map(function(o){return chip('texture',o);}).join('');
  /* 색 색인은 첨부된 '색으로 찾는 우리꽃 정원식물'의 7개 분류(빨간색·분홍색·
     주황색·노란색·초록색·보라색·흰색)를 그대로 쓴다. 기존 텍스트 추정 색상
     (COLOR_MAP)은 카드 배지·이야기 문구 등 다른 곳에서는 계속 쓰이지만, 이
     색인 필터에는 더 이상 쓰지 않는다(정확도 우선). */
  colorEl.innerHTML=colorOpts.map(function(o){
    var active=pFilter.color.indexOf(o)!==-1;
    return '<button type="button" class="cchip'+(active?' active':'')+'" onclick="pToggleFilterVal(\'color\',\''+o+'\',this)" title="'+o+'">'
      +'<span class="cdot" style="background:'+(BOOK_COLOR_HEX[o]||'#B7B3AA')+'"></span><span class="clabel">'+esc(o)+'</span></button>';
  }).join('');
}
function updateFilterBadge(){
  var badge=document.getElementById('pfilterbadge'),reset=document.getElementById('pfilterreset');
  if(!badge||!reset)return;
  var n=pFilter.usecat.length+pFilter.origin.length+pFilter.color.length+pFilter.form.length+pFilter.texture.length+pFilter.cycle.length+pFilter.light.length+pFilter.story.length;
  badge.textContent=n;
  reset.style.display=n?'inline-block':'none';
  renderFilterSummary();
}
var FILTER_KIND_KEYS=['usecat','origin','color','form','texture','cycle','light','story']; /* pFilter의 initial은 배열이 아니라 제외 */
/* [2026-09-21 UX 진단] 필터 패널이 평소엔 접혀 있고(디자인 세션이 최근에
   추가한 아코디언, Webflow 임베드 쪽 pToggleFilterAcc) 화살표를 눌러야
   펼쳐지는데, 접힌 상태에서는 "초기화 (3)"처럼 개수만 보이고 정확히 뭘
   골랐는지는 안 보였다 - 다시 펼쳐서 8개 구간을 하나하나 훑어야 했다.
   접었다 펴도 항상 보이는 자리(.pfilter-header 바로 다음, #pfilterbody
   앞)에 고른 값들을 작은 칩으로 늘어놓고, 칩을 누르면 그 값만 바로 뺀다
   (기존 pToggleFilterVal을 el 없이 불러 재사용 - 이미 검증된 제거 경로). */
function renderFilterSummary(){
  var bar=document.getElementById('pfilterbar'),body=document.getElementById('pfilterbody');
  if(!bar||!body)return;
  var sum=document.getElementById('pfiltersummary');
  if(!sum){
    sum=document.createElement('div');
    sum.id='pfiltersummary';
    sum.style.cssText='display:none;flex-wrap:wrap;gap:6px;margin-top:12px';
    bar.insertBefore(sum,body);
  }
  var chips=[];
  FILTER_KIND_KEYS.forEach(function(kind){
    (pFilter[kind]||[]).forEach(function(v){
      chips.push('<span class="pfsum-chip" onclick="event.stopPropagation();pToggleFilterVal(\''+kind+'\',\''+v.replace(/'/g,"\\'")+'\')">'+esc(v)+'<b aria-hidden="true">&#10005;</b></span>');
    });
  });
  sum.innerHTML=chips.join('');
  sum.style.display=chips.length?'flex':'none';
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
  if(!total){el.textContent='';return;}
  if(done<total){
    el.textContent='정원 정보 분석 중… ('+done+'/'+total+')';
    el.style.display='';
    return;
  }
  /* [2026-09-19 UX 미세점검 A1] 완료 후에도 문구가 계속 떠 있을 이유가
     없다 - 3초 보여준 뒤 스스로 사라진다. */
  el.textContent='정원 정보 분석 완료 ('+total+'개)';
  el.style.display='';
  clearTimeout(pFilterProgressHideTimer);
  pFilterProgressHideTimer=setTimeout(function(){el.style.display='none';},3000);
}
var pFilterProgressHideTimer=null;
/* 필터 영역은 검색결과 유무와 무관하게 항상 노출되는 상시 UI다(사용자 요청).
   예전에는 검색 결과에 도감(no) 항목이 하나라도 있을 때만 보였는데, 결과가
   바뀔 때마다 패널이 나타났다 사라졌다 하는 것 자체가 어색하다는 피드백. */
function showFilterBarIfNeeded(){ /* 상시 노출 - 더 이상 조건부로 숨기지 않음. 호출부 호환을 위해 함수만 유지 */ }
/* 한글 초성(자모) 색인 - "ㄱㄴㄷㄹㅁ... 순 색인을 클릭해서 찾기 편하게" 요청.
   19개 한글 초성(쌍자음 포함)을 사전/전화번호부에서 흔히 쓰는 14개 대표
   자음(ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ)으로 묶는다 - 쌍자음(ㄲㄸㅃㅆㅉ)으로
   시작하는 국명도 대응하는 예사소리 버튼(ㄱㄷㅂㅅㅈ)에서 함께 찾을 수 있다.
   기준은 국명(요청대로) - 국명이 없거나 한글로 시작하지 않으면(예: 국명 없이
   학명만 있는 커뮤니티 데이터) 어떤 자음을 선택해도 걸러지지 않는다. */
var INITIAL_CHARS=['ㄱ','ㄴ','ㄷ','ㄹ','ㅁ','ㅂ','ㅅ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
var INITIAL_GROUP={0:0,1:0,2:1,3:2,4:2,5:3,6:4,7:5,8:5,9:6,10:6,11:7,12:8,13:8,14:9,15:10,16:11,17:12,18:13};
function koInitial(nm){
  var t=(nm||'').trim();
  if(!t)return null;
  var code=t.charCodeAt(0);
  if(code<0xAC00||code>0xD7A3)return null;
  return INITIAL_CHARS[INITIAL_GROUP[Math.floor((code-0xAC00)/588)]];
}
function renderIndexBar(){
  var el=document.getElementById('pindex');
  if(!el)return;
  if(!pShown){el.style.display='none';el.innerHTML='';return;}
  el.style.display='flex';
  el.innerHTML='<span class="fchip'+(!pFilter.initial?' active':'')+'" onclick="pSetInitial(null)">전체</span>'
    +INITIAL_CHARS.map(function(ch){
      return '<span class="fchip'+(pFilter.initial===ch?' active':'')+'" onclick="pSetInitial(\''+ch+'\')">'+ch+'</span>';
    }).join('');
}
window.pSetInitial=function(ch){
  pFilter.initial=(pFilter.initial===ch)?null:ch;
  renderIndexBar();
  pHistPushSearch();
  if(pQ)applyFilters();else runFacetSearch();
};
function applyFilters(){
  var cards=document.querySelectorAll('#pgrid .pc');
  cards.forEach(function(card){
    var no=card.getAttribute('data-no'),uid=card.getAttribute('data-uid');
    var attrs=pAttrCache[no||('u'+uid)];
    var show=true;
    if(pFilter.usecat.length)show=show&&pFilter.usecat.some(function(v){return cardHasUseCat(card,attrs,v);});
    if(pFilter.origin.length)show=show&&pFilter.origin.some(function(v){return originCategoryMatch(card,attrs,v);});
    /* 색·형태·질감 색인은 첨부된 3권(형태로/질감으로/색으로 찾는 우리꽃
       정원식물)의 실제 분류만 정확히 매칭한다(bookAxisTag) - 텍스트 추정치인
       attrs.colors는 더 이상 이 색인에 쓰지 않는다. */
    if(pFilter.color.length){var sc0=card.getAttribute('data-sc');show=show&&pFilter.color.indexOf(bookAxisTag(sc0,'color'))!==-1;}
    if(pFilter.form.length){var sc1=card.getAttribute('data-sc');show=show&&pFilter.form.indexOf(bookAxisTag(sc1,'form'))!==-1;}
    if(pFilter.texture.length){var sc2=card.getAttribute('data-sc');show=show&&pFilter.texture.indexOf(bookAxisTag(sc2,'texture'))!==-1;}
    if(pFilter.light.length)show=show&&(attrs?pFilter.light.some(function(v){return (attrs.light||'').indexOf(v)!==-1;}):true);
    if(pFilter.cycle.length)show=show&&(attrs?pFilter.cycle.some(function(v){return (attrs.cycle||'').indexOf(v)!==-1;}):true);
    if(pFilter.story.length)show=show&&!!(attrs&&attrs.hasStory);
    if(pFilter.initial){
      var nmEl=card.querySelector('.pc-name');
      show=show&&(koInitial(nmEl?nmEl.textContent:'')===pFilter.initial);
    }
    card.style.display=show?'':'none';
  });
  updateFilterProgress();
  updateVisibleCountText(); /* [2026-09-19 UX 미세점검 A2] 필터로 카드가 숨겨져도 "총 N건 중 M건 표시" 문구가 그대로였다 */
  renderIndexBar();
}
/* [2026-09-19 UX 미세점검 A2] 필터 적용 뒤 실제로 화면에 보이는 카드 수로
   문구를 다시 쓴다. 조건에 맞는 카드가 하나도 없으면(꽃구근 필터 예시)
   빈 결과 안내 + 필터 초기화 링크로 바꾼다. */
function updateVisibleCountText(){
  var el=document.getElementById('pcnttxt');
  if(!el)return;
  var cards=document.querySelectorAll('#pgrid .pc');
  if(!cards.length)return;
  var visible=0;
  cards.forEach(function(c){if(c.style.display!=='none')visible++;});
  if(anyFilterActive()&&visible===0){
    el.innerHTML='조건에 맞는 식물이 없습니다 · <span style="text-decoration:underline;cursor:pointer" onclick="pResetFilters()">필터 초기화</span>';
    return;
  }
  el.textContent=anyFilterActive()
    ?('총 '+cards.length.toLocaleString()+'건 중 '+visible+'건 표시(필터 적용)')
    :('총 '+pAll.length.toLocaleString()+'건 중 '+pShown+'건 표시');
}
/* applyFilters()는 #pgrid의 모든 카드를 매번 다시 훑는 O(카드 수) 작업인데,
   loadAndRenderAttrs가 카드마다 정원정보가 도착할 때마다 이 함수를 그대로
   불러서 카드가 N장이면 사실상 O(N²)이 된다 - usecat 같은 필터는 결과가
   수백 건이라 체감이 안 됐지만, 초성 색인처럼 결과가 수천 건인 경우 카드
   하나하나의 정원정보 도착 콜백마다 수천 장을 다시 훑어 브라우저가 멈추는
   핵심 원인 중 하나였다("색인을 왔다갔다 하면 결과값이 사라진다"). 카드가
   많을 때는(REFLOW_LARGE_THRESHOLD 재사용) reflowGrid와 같은 방식으로
   일정 시간(500ms)에 한 번만 실제로 훑도록 묶는다 - 필터 칩을 직접 누를 때
   호출하는 applyFilters()는 이 함수를 거치지 않아 그 자리에서 바로 반영된다. */
var applyFiltersPending=false;
var applyFiltersLargeTimer=null;
function applyFiltersThrottled(){
  if(pShown>REFLOW_LARGE_THRESHOLD){
    if(applyFiltersLargeTimer)return;
    applyFiltersLargeTimer=setTimeout(function(){
      applyFiltersLargeTimer=null;
      applyFilters();
    },REFLOW_LARGE_DEBOUNCE);
    return;
  }
  if(applyFiltersPending)return;
  applyFiltersPending=true;
  var run=function(){applyFiltersPending=false;applyFilters();};
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(run);else setTimeout(run,16);
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
  /* 색·형태·질감은 "정확한 매칭" 요청에 따라 텍스트 추정치(attrs.colors)가
     아니라 첨부된 3권(형태로/질감으로/색으로 찾는 우리꽃 정원식물)의 실제
     분류를 그대로 쓴다(bookAxisTag, BOOK_AXIS_INDEX 참고) - 이 3권에 실린
     150종씩만 대상이 되므로 다른 필터보다 결과가 훨씬 좁혀질 수 있다. */
  if(pFilter.color.length&&pFilter.color.indexOf(bookAxisTag(entry.sc,'color'))===-1)return false;
  if(pFilter.form.length&&pFilter.form.indexOf(bookAxisTag(entry.sc,'form'))===-1)return false;
  if(pFilter.texture.length&&pFilter.texture.indexOf(bookAxisTag(entry.sc,'texture'))===-1)return false;
  if(pFilter.cycle.length&&!pFilter.cycle.some(function(v){return (attrs.cycle||'').indexOf(v)!==-1;}))return false;
  if(pFilter.light.length&&!pFilter.light.some(function(v){return (attrs.light||'').indexOf(v)!==-1;}))return false;
  if(pFilter.story.length&&!attrs.hasStory)return false;
  if(pFilter.initial&&koInitial(entry.nm)!==pFilter.initial)return false;
  return true;
}
function anyFilterActive(){
  return pFilter.usecat.length||pFilter.origin.length||pFilter.color.length||pFilter.form.length||pFilter.texture.length||pFilter.cycle.length||pFilter.light.length||pFilter.story.length||!!pFilter.initial;
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
  }).catch(function(){
    /* 이 체인에 .catch가 없으면(예전 상태) buildStaticIndex/필터링 중 예외가
       하나라도 나면 로딩 스피너가 영원히 멈춘 채로 남아 "로딩이 느리다"·
       "결과가 안 나온다"로 보인다 - 방어적으로 안내 문구를 띄우고 빠져나간다. */
    if(myToken!==facetSearchToken)return;
    hideLoading();hideAll();
    showError('정원 정보로 찾는 중 문제가 발생했습니다. 다시 시도해주세요.');
  });
}

/* ---- 동시 요청 수 제한 ----
   카드 20개가 한꺼번에 사진+정원정보 요청을 쏘면 브라우저 동시 연결 한도에
   걸려 오히려 전체적으로 느려지고 응답이 뒤섞여 보인다. 한 번에 8개까지만
   진행하도록 제한해, 화면이 순차적으로 빠르게 채워지도록 한다(소스가 국립
   수목원·농사로·위키·iNaturalist·GBIF 등 서로 다른 도메인에 나뉘어 있어
   5개보다 늘려도 특정 도메인에 병목이 몰리지 않는다 - "최대한 빠르게 노출"
   요청에 따라 기존 5에서 상향). 화면에 바로 보이는 첫 배치(위 카드 8개)는
   이 대기열조차 건너뛰고 즉시 요청한다(renderPage 참고). */
function makeLimiter(max){
  var active=0,queue=[];
  function next(){
    if(active>=max||!queue.length)return;
    active++;
    var job=queue.shift();
    var settled=false;
    function advance(){ /* 같은 카드 슬롯이 두 번 next()를 부르지 않도록 방어 */
      if(settled)return;
      settled=true;
      active--;
      next();
    }
    job.fn().then(job.resolve,job.reject).then(advance,advance);
    /* "8개 이후로는 아무것도 없다" 버그의 실제 원인 - 정부 API·프록시(농사로
       Cloudflare Worker) 등 외부 소스 중 하나가 드물게 응답 없이 멈춰버리면
       (에러도 성공도 아닌 영원한 pending), 그 작업이 차지한 동시요청 슬롯이
       영영 반환되지 않아 대기열 전체가 멈춘다 - 첫 배치(대개 화면에 사진이
       있는 카드들)만 채워지고 그 뒤로는 실제로 사진이 있는 종이어도 전부
       멈춰버렸던 이유. 8초 안에 끝나지 않는 작업은 포기하고 슬롯을 돌려줘
       나머지 카드들이 계속 채워지도록 한다(포기된 작업 자체가 나중에 실제로
       끝나면 그 카드에는 여전히 정상적으로 사진이 반영된다 - 대기열 진행만
       막지 않을 뿐). 카드 하나가 순차적으로 시도하는 사진 소스들의 개별
       타임아웃이 이제 TIMEOUT_PHOTO(3초) 등으로 더 짧아졌으므로, 워치독도
       그에 맞춰 8초 → 7초로 단축해 막힌 작업을 더 빨리 포기하고 다음 카드로
       넘어가게 한다. */
    setTimeout(advance,7000);
  }
  return function(fn){
    return new Promise(function(resolve,reject){
      queue.push({fn:fn,resolve:resolve,reject:reject});
      next();
    });
  };
}
var limitCard=makeLimiter(8);

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
/* 사진으로 찾기 결과(안내 문구 pnote/추천 칩 psugg)는 검색창에 텍스트가
   없어도 화면에 남을 수 있는데, 예전에는 "×" 버튼이 검색창에 글자가 있을
   때만 나타나서 이걸 지울 방법이 아예 없었다("유사도가 초기화 안 된다"는
   지적의 원인). 이제 pnote/psugg 둘 중 하나라도 보이면 검색창이 비어있어도
   "×" 버튼을 계속 보여줘, 언제든 눌러서 지울 수 있게 한다. */
function pHasStaleNote(){
  var noteEl=document.getElementById('pnote'),suggEl=document.getElementById('psugg');
  return (noteEl&&noteEl.style.display!=='none')||(suggEl&&suggEl.style.display!=='none');
}
function pUpdateClearBtn(){
  var el=document.getElementById('psi'),btn=document.getElementById('pclearbtn');
  if(!el||!btn)return;
  btn.style.display=(el.value.trim()||pHasStaleNote())?'flex':'none';
}
/* pnote/psugg를 확실히 비우고 숨긴다 - 검색어를 지우거나 필터로 돌아갈 때
   "사진 인식 결과입니다..." 안내나 유사도 추천 칩이 그대로 남아있지 않도록
   항상 함께 초기화한다. */
function pClearPhotoNote(){
  var noteEl=document.getElementById('pnote'),suggEl=document.getElementById('psugg');
  if(noteEl){noteEl.textContent='';noteEl.style.display='none';}
  if(suggEl){suggEl.innerHTML='';suggEl.style.display='none';}
}

/* ---- 뒤로가기(브라우저 History) 지원 ----
   "뒤로가기를 누르면 식물도감 페이지 자체를 벗어난다"는 지적 대응 - 지금까지는
   검색어를 바꾸거나 상세창을 열어도 브라우저 히스토리에 아무 흔적이 남지
   않아서, 검색을 몇 번 하고 뒤로가기를 누르면 이 화면의 이전 검색 상태가
   아니라 곧바로 이 페이지에 들어오기 전 화면(예: 홈)으로 빠져나갔다.
   검색어가 바뀌거나(pSearch/pSuggest/검색어 지우기) 상세창을 열 때마다
   history.pushState로 그 순간의 상태(검색어·필터·상세창 uid)를 기록해두고,
   popstate(뒤로/앞으로가기)가 발생하면 실제 페이지 이동 없이 그 상태로
   화면만 복원한다. 더 되돌릴 상태가 없을 때(state가 null)만 브라우저
   기본 동작(진짜 뒤로가기)에 맡긴다. */
var pSuppressHistory=false;
function pFilterSnapshot(){return JSON.parse(JSON.stringify(pFilter));}
function pHistPushSearch(){
  if(pSuppressHistory)return;
  history.pushState({type:'search',q:pQ,filter:pFilterSnapshot()},'',location.href);
}
function pHistPushDetail(uid){
  if(pSuppressHistory)return;
  history.pushState({type:'detail',uid:uid},'',location.href);
}
function pHistRestoreSearch(st){
  pSuppressHistory=true;
  var ov=document.getElementById('pov');
  var wasOverlayOpen=!!(ov&&ov.style.display==='flex');
  /* 스크롤 위치 복원(pUnlockScroll의 scrollTo)은 아래에서 화면 높이가 최종
     확정된 뒤로 미룬다 - body의 fixed 잠금만 지금 풀어둔다. */
  if(wasOverlayOpen){pHidePov();pUnlockScrollBody();}
  var el=document.getElementById('psi');
  var q=(st&&st.q)||'';
  if(el)el.value=q;
  pFilter=(st&&st.filter)?st.filter:{usecat:[],origin:[],color:[],form:[],texture:[],cycle:[],light:[],story:[],initial:null};
  renderFilterPanel();updateFilterBadge();
  pQ=q;
  pUpdateClearBtn();
  if(pQ)runSearch();
  else if(anyFilterActive())runFacetSearch();
  else{hideLoading();hideAll();document.getElementById('pinit').style.display='block';document.getElementById('pcnt').style.display='none';}
  renderIndexBar();
  pSuppressHistory=false;
  if(wasOverlayOpen){
    /* 검색어·필터가 없어 맨 처음 안내 화면으로 돌아가는 경우(위 else 분기)처럼
       문서 높이가 곧바로 크게 줄어드는 경우까지 반영된 뒤에 스크롤을 옮겨야
       "닫으면 하단(푸터)으로 튀는" 문제가 재발하지 않는다 - 레이아웃이 다시
       계산될 시간을 주기 위해 두 번의 requestAnimationFrame으로 미룬다
       (runSearch/runFacetSearch처럼 네트워크 응답으로 나중에 채워지는 결과는
       대개 안내 화면보다 페이지가 짧아지지 않으므로 이 정도로 충분하다). */
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){
        window.scrollTo(0,Math.min(pScrollLockY,pClampedScrollY()));
      });
    });
  }
}
function pOnPopState(e){
  var st=e.state;
  if(!st)return; /* 더 되돌릴 상태가 없음 - 브라우저가 실제로 이전 페이지로 이동하게 둔다 */
  if(st.type==='detail'){
    var it=pAll.filter(function(x){return x._uid===st.uid;})[0];
    pSuppressHistory=true;
    if(it)pDetail(it);
    else{pHidePov();pUnlockScroll();}
    pSuppressHistory=false;
  } else {
    pHistRestoreSearch(st);
  }
}

window.pOnSearchInput=function(){
  var el=document.getElementById('psi');
  if(el&&!el.value.trim())pClearedSearch(); /* note/psugg를 먼저 지운 뒤에 버튼 표시를 계산한다 */
  pUpdateClearBtn();
};
/* "×" 버튼 또는 검색어를 손으로 지웠을 때 공통으로 타는 경로 - 새로 검색하고
   싶을 때는 이 버튼 한 번으로 검색어만 깔끔히 비우고, 선택해둔 필터는 그대로
   남겨서 바로 "정원 정보로 찾기" 결과를 보여준다. */
window.pClearSearchBox=function(){
  var el=document.getElementById('psi');
  if(el)el.value='';
  pClearedSearch(); /* note/psugg를 먼저 지운 뒤에 "×" 버튼 표시 여부를 계산해야 한다 */
  pUpdateClearBtn();
};
window.pSuggest=function(term){
  var el=document.getElementById('psi');
  if(el)el.value=term;
  pUpdateClearBtn();
  pQ=term;
  pHistPushSearch();
  runSearch();
};

/* 검색 버튼을 눌렀을 때 "눌렸다"는 반응이 전혀 없어 클릭이 먹혔는지조차
   알 수 없다는 지적 대응 - 결과가 뜨기까지 걸리는 시간과 무관하게, 누른
   즉시 버튼이 살짝 눌리는 느낌을 줘 클릭이 실제로 등록됐다는 걸 바로
   알려준다. 실제 라이브 마크업의 클래스명(.psearch-submit)을 우선
   찾고, 못 찾으면 onclick 속성으로 같은 버튼을 짚는다. */
function pPulseSearchBtn(){
  var btn=document.querySelector('.psearch-submit')||document.querySelector('button[onclick*="pSearch"]');
  if(!btn)return;
  btn.style.transition='transform .12s ease';
  btn.style.transform='scale(.94)';
  setTimeout(function(){btn.style.transform='';},140);
}
window.pSearch=function(){
  pPulseSearchBtn();
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
  pHistPushSearch();
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
  pClearPhotoNote(); /* 사진 인식 안내/추천 칩이 남아있지 않도록 항상 함께 지운다 */
  pHistPushSearch();
  if(anyFilterActive()){
    runFacetSearch();
  } else {
    hideLoading();hideAll();
    document.getElementById('pinit').style.display='block';
    document.getElementById('pcnt').style.display='none';
  }
};

/* ---- 사진으로 식물 찾기 (Pl@ntNet API) ----
   "사진을 업로드하면 식물을 찾아주는 기능을 붙여달라"는 요청에 따라 추가.
   iNaturalist의 사진인식(Computer Vision) API는 일반에 공개되지 않고 소수
   기관에만 이메일로 개별 승인해주는 비공개 API라 쓸 수 없었다(포럼 공지로
   확인). 대신 저작권·이용조건이 명확한 공개 서비스인 Pl@ntNet API(사용자가
   my.plantnet.org에서 직접 발급한 키)를 쓴다.
   my-api.plantnet.org는 브라우저에서 키를 그대로 붙여 직접 호출하면 CORS가
   막힌다(Pl@ntNet 공식 web-component 문서에 명시됨) - 이미 같은 이유로 만들어
   둔 nongsaro-proxy-worker.js(Cloudflare Worker)에 /plantid 라우트를 추가해
   그 워커를 그대로 재사용한다(NONGSARO_PROXY 주소 재사용, 새 프록시 주소를
   따로 둘 필요 없음).
   Pl@ntNet이 돌려준 학명 후보는 이 앱이 이미 들고 있는 정적 데이터셋
   (STATIC_SPECIES/STATIC_NAME, 국가표준식물목록 3.6만종)과 대조해, 도감에
   있는 종은 그 국명으로 바로 검색 결과 카드를 보여준다(기존 renderPage
   재사용). "검색 결과 카드가 Pl@ntNet에서 가져오는 것을 1차로 보여달라"는
   요청에 따라, 도감에 없는 종도 더 이상 추천 검색어 칩으로만 격하하지 않고
   Pl@ntNet이 직접 알려준 학명·영문명·과명으로 카드를 만든다 - 이 카드들
   (origin:'plantnet')이 결과 맨 위에 우선 배치되고, 도감에서 국명까지 찾은
   카드(origin:'static')는 그 뒤에 이어진다(각 그룹 내부는 유사도순, 자세한
   정렬은 pIdentifyPhoto 참고) - 사진과 마찬가지로 loadCardImage가 학명
   기준으로 위키·iNaturalist·GBIF 등에서 대표 사진을 찾아준다. */
/* STATIC_NAME/STATIC_SPECIES는 국가표준식물목록 원본 표기(대개 "Genus species"
   형태)를 키로 쓰는데, Pl@ntNet이 돌려주는 학명은 대소문자가 항상 그와 같다는
   보장이 없다(실측으로 대소문자 표기가 어긋나는 사례 확인) - 정확히 같은
   종인데도 대소문자 차이만으로 "도감에 없는 종"으로 잘못 분류돼 국명을 못
   찾고 영문명 번역만 쓰던 사례의 원인 중 하나. 대소문자를 무시한 색인을
   한 번만 만들어두고, 원문 그대로의 키로 못 찾았을 때만 보조로 쓴다(만들어
   두는 비용을 아끼려 최초 실패 시점에 지연 생성). */
var STATIC_NAME_LC=null,STATIC_SPECIES_LC=null;
function buildStaticLcIndex(){
  if(STATIC_NAME_LC)return;
  STATIC_NAME_LC={};STATIC_SPECIES_LC={};
  Object.keys(STATIC_NAME).forEach(function(k){STATIC_NAME_LC[k.toLowerCase()]=STATIC_NAME[k];});
  Object.keys(STATIC_SPECIES).forEach(function(k){STATIC_SPECIES_LC[k.toLowerCase()]=STATIC_SPECIES[k];});
}
function pMatchLocalByName(sciNameRaw,pct){
  var key=cleanSciName(sciNameRaw);
  if(!key)return null;
  var sp=STATIC_SPECIES[key],nm=STATIC_NAME[key];
  if(!sp&&!nm){
    buildStaticLcIndex();
    var lc=key.toLowerCase();
    sp=STATIC_SPECIES_LC[lc];nm=STATIC_NAME_LC[lc];
  }
  if(!sp&&!nm)return null;
  var korNm=(sp&&sp.kn)||(nm&&nm.kn)||key;
  var fam=(nm&&nm.family)||'';
  return {nm:korNm,sc:key,fam:fam,no:'',specsId:'',origin:'static',pct:(pct==null?null:pct),_uid:++pCardUid};
}
/* 도감에 없는 Pl@ntNet 후보의 카드 이름 - "학명·영명을 제외한 내용은 한글로
   번역해서 보여달라"는 요청 대응. Pl@ntNet은 영문 커먼네임만 주므로(한국어
   로케일 미지원), 그 영문명을 무료 번역 API(MyMemory, 별도 키 필요 없음)로
   한글로 옮겨 카드 이름으로 쓰고, 원문 영문명은 괄호로 함께 남겨 번역이
   틀렸을 때도 원래 이름을 바로 확인할 수 있게 한다. 학명(sc)은 카드에서
   항상 원문 그대로(sciNameHtml) 보여주므로 이 함수가 건드리지 않는다.
   번역 실패/시간초과/무료 할당량 소진 경고 등은 조용히 원문 영문명만 쓴다
   (번역이 안 됐다고 카드 자체가 비거나 이상한 문구가 뜨면 안 되므로). */
var pTranslateCache={};
function translateEnToKo(text){
  if(!text)return Promise.resolve('');
  var key=text.trim().toLowerCase();
  if(pTranslateCache[key]!==undefined)return Promise.resolve(pTranslateCache[key]);
  var url='https://api.mymemory.translated.net/get?q='+encodeURIComponent(text)+'&langpair=en|ko';
  return fetchWithTimeout(url,TIMEOUT_TRANSLATE).then(function(r){return r.ok?r.json():null;}).then(function(j){
    var t=(j&&j.responseData&&j.responseData.translatedText)||'';
    if(!t||/mymemory|invalid|quota/i.test(t))t=text; /* 경고 문구·빈 응답 방어 */
    pTranslateCache[key]=t;
    return t;
  }).catch(function(){return text;});
}
/* 번역이 도착하면 이미 그려진 카드의 이름 텍스트만 갱신한다(사진 재요청·
   정원정보 재조회·재정렬 없이) - 유사도(pct)는 그대로라 카드 순서가 바뀔
   이유가 없고, 이름 텍스트 교체만으로 충분하다. */
function updatePhotoIdCardName(it){
  var rec=pCardEls[it._uid];
  if(!rec)return;
  var nmEl=rec.el.querySelector('.pc-name');
  if(nmEl)nmEl.textContent=it.nm;
}
window.pPhotoTrigger=function(){
  var el=document.getElementById('pphotoinput');
  if(el)el.click();
};
/* Pl@ntNet 공식 문서(FAQ)에 따르면 같은 개체의 사진을 여러 장(같은 부위라도,
   특히 꽃·열매처럼 정보량이 많은 부위 위주로) 함께 보내면 한 장만 보낼 때보다
   식별 정확도가 뚜렷하게 올라간다. 그래서 파일 입력에 multiple을 허용해
   갤러리에서 여러 장을 한 번에 고르면 그대로 같은 개체의 사진들로 간주해
   API 한 번에 함께 보낸다(장당 부위는 auto로 두어 AI가 각각 추정하게 하며,
   API 제한대로 최대 5장까지만 사용한다). */
/* 휴대폰 카메라 원본은 수 MB~수십 MB에 이르러 업로드/분석 대기 시간이
   길어지는 주된 원인이다. 캔버스로 긴 변 기준 1280px, JPEG 품질 0.85로
   축소·재인코딩해 전송 용량을 크게 줄인다(Pl@ntNet 인식에는 이 정도
   해상도로 충분). 압축 결과가 오히려 더 크거나 실패하면 원본을 그대로
   사용해 기능이 깨지지 않게 한다. */
var PLANTID_MAX_DIM=1280;
var PLANTID_JPEG_QUALITY=0.85;
function compressImageFile(file,maxDim,quality){
  return new Promise(function(resolve){
    if(!file||!/^image\//.test(file.type||'')){resolve(file);return;}
    var url;
    try{url=URL.createObjectURL(file);}catch(e){resolve(file);return;}
    var img=new Image();
    img.onload=function(){
      URL.revokeObjectURL(url);
      var w=img.width,h=img.height;
      if(!w||!h){resolve(file);return;}
      var scale=Math.min(1,maxDim/Math.max(w,h));
      var tw=Math.max(1,Math.round(w*scale)),th=Math.max(1,Math.round(h*scale));
      try{
        var canvas=document.createElement('canvas');
        canvas.width=tw;canvas.height=th;
        var ctx=canvas.getContext('2d');
        ctx.drawImage(img,0,0,tw,th);
        canvas.toBlob(function(blob){
          if(!blob||blob.size>=file.size){resolve(file);return;}
          var newName=(file.name||'photo.jpg').replace(/\.[^.]+$/,'')+'.jpg';
          var newFile;
          try{newFile=new File([blob],newName,{type:'image/jpeg'});}
          catch(e){newFile=blob;}
          resolve(newFile);
        },'image/jpeg',quality);
      }catch(e){resolve(file);}
    };
    img.onerror=function(){URL.revokeObjectURL(url);resolve(file);};
    img.src=url;
  });
}
window.pOnPhotoSelected=function(input){
  var files=input&&input.files;
  if(!files||!files.length)return;
  var picked=Array.prototype.slice.call(files,0,5);
  input.value=''; /* 같은 사진을 다시 골라도 change 이벤트가 다시 일어나도록 비워둔다 */
  showLoading(); /* 압축 중에도 바로 로딩 표시를 띄워 사용자가 멈춘 것으로 오해하지 않게 한다 */
  Promise.all(picked.map(function(f){return compressImageFile(f,PLANTID_MAX_DIM,PLANTID_JPEG_QUALITY);})).then(function(compressed){
    pIdentifyPhoto(compressed);
  });
};
/* Pl@ntNet이 한 번에 돌려주는 후보를 5개만 보던 것을 10개로 늘려(nb-results),
   도감에 있지만 순위가 다소 낮게 나온 종까지 매칭 기회를 넓힌다. 동시에
   점수가 사실상 0에 가까운(1% 미만) 후보는 노이즈로 보고 매칭/추천 어느
   쪽에도 올리지 않아, "낮은 확신도의 엉뚱한 결과"가 마치 정답처럼 보이는
   일을 줄인다. 도감에서 찾은 종은 이제 Pl@ntNet 점수(유사도)를 배지로
   함께 보여줘 사용자가 그 결과를 어느 정도 신뢰할지 스스로 판단할 수 있다. */
var PLANTID_NB_RESULTS=10;
var PLANTID_MIN_SCORE=0.01;
var PLANTID_TIMEOUT=25000; /* 사진 인식 요청이 이 시간(ms) 안에 끝나지 않으면
   중단하고 안내 메시지를 보여준다(무한 로딩 방지) */
function pIdentifyPhoto(files){
  if(!NONGSARO_PROXY){
    showError('사진으로 찾기 기능을 지금은 사용할 수 없습니다.');
    return;
  }
  showLoading();
  var fd=new FormData();
  files.forEach(function(file){
    fd.append('images',file,file.name||'photo.jpg');
    fd.append('organs','auto');
  });
  var url=NONGSARO_PROXY.replace(/\/$/,'')+'/plantid?lang=en&nb-results='+PLANTID_NB_RESULTS;
  var pidCtrl=(typeof AbortController!=='undefined')?new AbortController():null;
  var pidTimedOut=false;
  var pidTimer=pidCtrl?setTimeout(function(){pidTimedOut=true;pidCtrl.abort();},PLANTID_TIMEOUT):null;
  fetch(url,{method:'POST',body:fd,signal:pidCtrl?pidCtrl.signal:undefined}).then(function(r){
    if(pidTimer)clearTimeout(pidTimer);
    return r.json().catch(function(){return null;}).then(function(j){return {ok:r.ok,body:j};});
  }).then(function(res){
    if(!res.ok||!res.body){
      showError('사진에서 식물을 인식하지 못했습니다. 선명한 잎·꽃 사진으로 다시 시도해보세요.');
      return;
    }
    var results=(res.body&&res.body.results)||[];
    if(!results.length){
      showError('사진에서 식물을 찾지 못했습니다. 다른 각도의 사진으로 다시 시도해보세요.');
      return;
    }
    staticDataReady.then(function(){
      var matched=[],seen={},toTranslate=[];
      results.slice(0,PLANTID_NB_RESULTS).forEach(function(r){
        if((r.score||0)<PLANTID_MIN_SCORE)return; /* 사실상 0에 가까운 점수는 노이즈로 취급 */
        var sci=r.species&&r.species.scientificNameWithoutAuthor;
        if(!sci)return;
        /* 카드에 보여줄 학명(sc)은 대소문자를 그대로 보존해야 sciNameHtml의
           이탤릭 판정(속명은 첫 글자 대문자)이 정상 동작한다 - 중복 판정용
           키(dedupeKey)만 별도로 소문자화한다(예전엔 이 둘을 하나로 합쳐써서
           카드의 학명이 전부 소문자로 나오는 부작용이 있었다). */
        var cleanSci=cleanSciName(sci);
        var dedupeKey=cleanSci.toLowerCase();
        if(!dedupeKey||seen[dedupeKey])return;
        seen[dedupeKey]=true;
        var pct=Math.round((r.score||0)*100);
        var hit=pMatchLocalByName(sci,pct);
        if(hit){
          matched.push(hit);
        } else {
          /* 도감에 없어도 "Pl@ntNet에서 가져오는 것을 1차로" 요청에 따라 더 이상
             칩으로 격하하지 않고, Pl@ntNet이 준 학명·영문명·과명으로 바로 카드를
             만든다. 이름 칸은 우선 영문명으로 채워 카드가 즉시 보이게 하고,
             한글 번역이 도착하면 텍스트만 조용히 교체한다("최대한 빠르게"
             요청과 병행). */
          var engNm=(r.species.commonNames&&r.species.commonNames[0])||'';
          var famNm=(r.species.family&&r.species.family.scientificNameWithoutAuthor)||'';
          var card={nm:engNm||cleanSci,sc:cleanSci,fam:famNm,no:'',specsId:'',origin:'plantnet',pct:pct,_uid:++pCardUid,engNm:engNm};
          matched.push(card);
          if(engNm)toTranslate.push(card);
        }
      });
      /* "plantnet 카드가 우선 나오게 하라"는 요청에 따라, 도감에 매칭되지 않아
         Pl@ntNet이 알려준 정보를 그대로 쓰는 카드(origin:'plantnet')를 먼저
         배치하고, 도감에서 찾은 카드(origin:'static')는 그 뒤에 둔다. 각
         그룹 안에서는 여전히 Pl@ntNet 유사도(pct) 높은 순으로 정렬한다. */
      matched.sort(function(a,b){
        var ao=(a.origin==='plantnet')?0:1,bo=(b.origin==='plantnet')?0:1;
        if(ao!==bo)return ao-bo;
        return (b.pct||0)-(a.pct||0);
      });
      hideLoading();hideAll();
      pQ='';
      var noteEl=document.getElementById('pnote'),suggEl=document.getElementById('psugg');
      suggEl.innerHTML='';suggEl.style.display='none'; /* 이제 모든 후보를 카드로 보여주므로 별도 추천 칩은 쓰지 않는다 */
      if(matched.length){
        noteEl.textContent='사진 인식 결과입니다(Pl@ntNet). 카드의 "유사도"는 Pl@ntNet의 인식 확신도이고, 도감에 등록되지 않은 종은 Pl@ntNet이 알려준 이름을 한글로 옮겨 보여드려요(학명·영문명은 원문 그대로). 여러 각도(특히 꽃·열매)의 사진을 함께 올리면 더 정확해져요.';
        noteEl.style.display='block';
        pAll=matched;pShown=0;
        renderPage();
        toTranslate.forEach(function(card){
          translateEnToKo(card.engNm).then(function(ko){
            if(ko&&ko.trim()&&ko.trim().toLowerCase()!==card.engNm.trim().toLowerCase()){
              card.nm=ko.trim()+' ('+card.engNm+')';
              updatePhotoIdCardName(card);
            }
          });
        });
      } else {
        noteEl.textContent='도감에서 일치하는 식물을 찾지 못했습니다.';
        noteEl.style.display='block';
        document.getElementById('pemp').style.display='block';
        document.getElementById('pcnt').style.display='none';
      }
      pUpdateClearBtn(); /* note/psugg 표시가 최종 확정된 뒤에 호출해야 "×" 버튼이 올바르게 나타난다 */
    });
  }).catch(function(){
    if(pidTimer)clearTimeout(pidTimer);
    if(pidTimedOut){
      showError('사진 분석이 너무 오래 걸려 중단했습니다. 사진 용량을 줄이거나 Wi-Fi 환경에서 다시 시도해주세요.');
    } else {
      showError('사진을 분석하는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    }
  });
}

/* 식물도감(정식 도감 항목)과 식물표본(표본관 채집기록) 두 목록을 함께 조회해 합치면,
   도감에는 없지만 표본으로만 등록된 종까지 검색 결과에 포함되어 누락이 크게 줄어든다.
   numOfRows는 100에서 50으로 낮춰 정부 API 응답 속도를 조금 더 확보했다(실측상
   대부분의 검색어는 결과가 50건을 넘지 않아 누락 문제는 재발하지 않는다). */
function fetchSourceItems(path,q){
  var cacheKey='src|'+path+'|'+q;
  var cached=cacheGet(cacheKey,SEARCH_CACHE_TTL);
  if(cached!==undefined)return Promise.resolve(cached);
  var url=buildUrl(path,{pageNo:1,numOfRows:50,reqSearchWrd:q});
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
  return fetchWithTimeout(url,TIMEOUT_INAT_SEARCH).then(function(r){return r.ok?r.json():null;}).then(function(j){
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
/* "검색 결과값 우선순위" 요청에 따른 4단계 노출 순위 -
   1순위: 실내 정원 식물(농사로 실내정원용 식물 목록에 국명+학명까지 검증된
   종, it._indoorGarden), 2순위: 국립수목원(정식 도감, it.no)과 농촌진흥청
   (민간약초·잡초 자원정보, it._bothAgencies) 데이터가 모두 있는 식물,
   3순위: 사진과 정원 정보(용도/색상 등)가 둘 다 채워진 식물, 4순위: 나머지.
   이 네 등급은 loadGardenTier()가 비동기로 채우는 _indoorGarden/_bothAgencies
   와, 기존에 있던 사진(_hasPhoto)·정원정보(_attrsRich) 플래그로 판정한다.
   아직 비동기 결과가 도착하지 않은 상태(undefined)는 확정된 낮은 등급보다는
   위, 확정된 높은 등급보다는 아래에 두는 중간값을 줘서(+0.5) 결과가 도착하기
   전에 맨 아래로 떨어지지 않게 한다. */
function priorityTier(it){
  var unresolved=(it._indoorGarden===undefined||it._bothAgencies===undefined||it._hasPhoto===undefined||it._attrsRich===undefined);
  var tier;
  if(it._indoorGarden===true)tier=4;
  else if(it._bothAgencies===true)tier=3;
  else if(it._hasPhoto===true&&it._attrsRich===true)tier=2;
  else tier=1;
  return unresolved?tier+0.5:tier;
}
/* 화면 표시 순서 전용 점수. 검색어가 있는 경우에는(pQ) 검색어 일치도가
   무조건 다른 모든 기준보다 우선한다(×100 가중치 - 위 4단계 우선순위 폭
   (최대 40)보다 한 단계 차이만 나도 항상 앞서도록) - 정확히 입력한 이름이
   다른 종에 밀려 안 보이는 일을 막기 위함. priorityTier(×10)가 그다음으로
   크게 반영되고, 남은 rankOf(콘텐츠 충실도)와 실제 종묘장 유통 여부
   (DAILIM_PLANT_SET)는 동률일 때만 갈리는 작은 세부 기준으로 남긴다. */
function displayScore(it){
  var match=pQ?queryMatchScore(it,pQ)*100:0;
  var tier=priorityTier(it)*10;
  var rankNorm=(rankOf(it)-1)/3; /* 1~4 -> 0~1, 세부 동률 정렬용 */
  var market=isDailimPlant(it.nm)?0.3:0;
  return match+tier+rankNorm+market;
}
function isAttrsRich(attrs){return !!(attrs&&((attrs.tags&&attrs.tags.length)||(attrs.useCats&&attrs.useCats.length)));}
/* 이미 그려진 카드(사진 로딩 등)를 새로 만들지 않고, DOM에 붙어있는 노드를
   appendChild로 재배치만 해서 순서를 displayScore 기준으로 맞춘다. 사진/정원
   정보가 비동기로 속속 도착할 때마다 호출되므로, 카드를 새로 만들거나 이미
   불러온 사진을 다시 불러오지 않는다 - 순서만 바뀐다. */
/* reflowGrid는 이미지 로드/속성 로드/정원등급 로드/소스별 검색 도착/카드 업그레이드 등
   ~10곳의 비동기 완료 콜백에서 매번 호출된다. 결과가 수백 장인 상태에서 이 전부가
   거의 동시에 몰리면(예: 이미지 수십 장이 한꺼번에 로드 완료) 매번 O(n log n) 정렬 +
   전체 DOM 재부착이 반복되어 프레임을 잡아먹는다 - "노출이 느리다"의 핵심 원인 중 하나.
   requestAnimationFrame으로 여러 번의 연속 호출을 프레임당 1회로 합친다(디바운스). */
/* "정원 정보로 찾기"(필터만으로 검색)는 검색어 검색과 달리 결과가 한 번에
   수백 건(233~560여 건 실측)에 달할 수 있다 - PAGE_SIZE=Infinity라 전부
   카드로 그려지고, 카드마다 사진/정원정보/정원등급 로딩이 각자 비동기로
   끝나면서 그때마다 이 reflowGrid를 부른다. 카드 200~500장을 대상으로 매번
   O(n log n) 정렬(문자열 localeCompare 포함) + appendChild 재배치를 하면,
   비동기 응답이 쏟아지는 수십 프레임 동안 이 작업이 계속 반복돼 브라우저가
   버벅이거나(체감상 "로딩이 느리다") 심하면 몇 초간 멈춘 것처럼 보인다.
   requestAnimationFrame 디바운스만으로는 "같은 프레임에 몰린 호출"만 합쳐질
   뿐, 응답이 여러 프레임에 걸쳐 흩어져 도착하면 그만큼 여러 번 실행된다.
   화면에 뜬 카드 수가 많을 때는(정상적인 검색어 검색 결과는 대개 수십 건
   이내라 영향 없음) 정렬 주기를 프레임 단위 대신 일정 시간(500ms)으로
   늦춰, 그 사이 도착하는 여러 비동기 완료를 한 번의 정렬로 묶는다. */
var REFLOW_LARGE_THRESHOLD=80;
var REFLOW_LARGE_DEBOUNCE=500;
var reflowGridPending=false;
var reflowGridLargeTimer=null;
function reflowGridRun(){
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
function reflowGrid(){
  if(pShown>REFLOW_LARGE_THRESHOLD){
    if(reflowGridLargeTimer)return;
    reflowGridLargeTimer=setTimeout(function(){
      reflowGridLargeTimer=null;
      reflowGridRun();
    },REFLOW_LARGE_DEBOUNCE);
    return;
  }
  if(reflowGridPending)return;
  reflowGridPending=true;
  var run=function(){
    reflowGridPending=false;
    reflowGridRun();
  };
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(run);else setTimeout(run,16);
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
  var renderTimer=null;
  /* [2026-09-19 UX 미세점검 B4] 소스 9개가 최대 2.6초에 걸쳐 따로따로
     도착할 때마다 renderPage()를 매번 불러 카드가 1→4→9→11장씩 여러
     번에 나눠 자라 보였다(실측 4번). 첫 배치는 체감 속도를 위해 즉시
     그리고, 그 뒤 도착하는 소스들은 500ms 안에 모아 한 번만 그린다 -
     마지막 남은 소스(pending===1)는 더 기다릴 다음 소스가 없으니
     디바운스 없이 바로 그린다. 결과: 보통 최대 2배치로 줄어든다. */
  function queueRender(flushNow){
    if(flushNow){
      if(renderTimer){clearTimeout(renderTimer);renderTimer=null;}
      renderPage();
      return;
    }
    if(renderTimer)return;
    renderTimer=setTimeout(function(){
      renderTimer=null;
      if(myQuery!==pQ)return;
      renderPage();
    },500);
  }

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
    /* [2026-09-18] 조용한 실패 금지(마스터 v1.5 16절 원칙 4, 백로그 26). 국립수목원 계열 소스가
       전부 실패했는데 다른 출처(생물다양성DB·정원 정보)가 결과를 내면 예전엔 화면에 아무 표시가
       없어, 2026-09-08~15 장애 때 "결과가 적네" 정도로만 보였다. 이제는 결과 위 안내줄(#pnote)에
       연결 실패를 분명히 적고 콘솔에도 남긴다. 결과가 0건일 때는 위의 showError 가 그대로 맡는다. */
    if(pending===0&&myQuery===pQ&&pAll.length&&!govOk&&govErr){
      var noteEl=document.getElementById('pnote');
      if(noteEl){
        noteEl.textContent='국립수목원 도감 데이터에 연결하지 못했습니다('+(govErr.message||'네트워크 오류')+'). 지금 보이는 결과는 다른 출처(생물다양성DB·정원 정보)에서만 가져온 것이라 도감 상세·학명 정보가 빠져 있을 수 있습니다. 잠시 후 다시 검색해 주세요.';
        noteEl.style.display='block';
      }
      if(window.console&&console.warn)console.warn('[plant-guide] 국립수목원 API 실패 — 다른 출처 결과만 표시:',govErr.message||govErr);
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
        var isFirst=!firstShown;
        if(!firstShown){
          hideLoading();hideAll();
          document.getElementById('pcnt').style.display='flex';
          document.getElementById('pgrid').style.display='grid';
          firstShown=true;
          /* [2026-09-19 UX 미세점검 B1] 검색 버튼을 눌러도 화면이 히어로에
             그대로 있어 "아무 일도 안 일어난 것"처럼 보였다(실측: 첫 카드
             top 1,163px). 결과 첫 배치가 도착하는 순간 결과 영역 상단으로
             한 번 스크롤한다. */
          var cntEl=document.getElementById('pcnt');
          if(cntEl)cntEl.scrollIntoView({behavior:'smooth',block:'start'});
        }
        queueRender(isFirst||pending===1);
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
  /* 사진으로 식물 찾기 결과에만 pct(Pl@ntNet 유사도)가 채워진다 - 어떤 origin이든
     이 배지를 최우선으로 보여줘, 결과가 어느 정도 확신도로 나온 것인지 사용자가
     바로 알 수 있게 한다("정확도를 최대한 높여달라"는 요청 대응: 매칭 자체의
     정확도뿐 아니라, 낮은 확신도 결과를 마치 확실한 정답처럼 보여주지 않는
     투명성도 정확도의 일부로 본다). */
  if(it.pct!=null)return'<span class="pc-tag">사진 인식 · 유사도 '+it.pct+'%</span>';
  if(BADGE_LABEL[it.origin])return '<span class="pc-tag">'+BADGE_LABEL[it.origin]+'</span>';
  if(it.origin==='inat')return'<span class="pc-tag">생물다양성DB</span>';
  if(it.origin==='static')return'<span class="pc-tag">정원 정보</span>';
  return'';
}
function coreHtml(it){
  return '<p class="pc-name">'+esc(it.nm)+'</p><p class="pc-sci">'+sciNameHtml(it.sc)+'</p>'+(it.fam?'<span class="pc-fam">'+esc(it.fam)+'</span>':'')+badgeFor(it);
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
  d.setAttribute('data-sc',it.sc||'');
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
  loadGardenTier(it,d);
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
var pPrevCompareN=0;
/* [2026-09-19 UX 미세점검 C4] display:none↔flex 직전환이라 등장 애니메이션이
   없었다. display는 여전히 JS가 토글하되(완전히 감추기·탭 접근성), 등장/퇴장은
   pcmpbar-visible 클래스의 transform(translateY)으로 애니메이션한다 - display:
   none→flex 직후 강제 리플로우 없이 바로 클래스를 붙이면 시작 위치(화면 밖)가
   적용되기 전에 도착 위치로 트랜지션이 생략될 수 있어 getBoundingClientRect로
   한 번 리플로우를 강제한다. 사라질 때는 트랜지션(.2s)이 끝난 뒤에야
   display:none으로 완전히 치운다(그 전에 없애면 애니메이션 없이 뚝 사라짐). */
function renderCompareBar(){
  var bar=document.getElementById('pcmpbar');
  if(!bar)return;
  var n=compareCount();
  var cnt=document.getElementById('pcmpcount');
  cnt.textContent=n;
  if(n>pPrevCompareN){ /* 항목이 늘어날 때만 배지 펄스 - 비우기/제거는 펄스 없음 */
    cnt.classList.remove('pcmpcount-pulse');
    void cnt.offsetWidth; /* 강제 리플로우 - 클래스를 뗐다 바로 다시 붙여도 애니메이션이 재생되게 */
    cnt.classList.add('pcmpcount-pulse');
  }
  pPrevCompareN=n;
  var go=document.getElementById('pcmpgo');
  go.disabled=n<2;
  if(n){
    bar.style.display='flex';
    bar.getBoundingClientRect();
    bar.classList.add('pcmpbar-visible');
  } else {
    bar.classList.remove('pcmpbar-visible');
    setTimeout(function(){
      if(compareCount()===0)bar.style.display='none';
    },220);
  }
  var thumbs=document.getElementById('pcmpthumbs');
  thumbs.innerHTML=Object.keys(pCompareSet).map(function(uid){
    var rec=pCompareSet[uid];
    var img=rec.el.querySelector('.pc-img img');
    var src=img?img.src:'';
    return '<div style="position:relative;flex-shrink:0" title="'+esc(rec.it.nm)+'">'
      +(src?'<img src="'+src+'" style="width:40px;height:40px;object-fit:cover;display:block">':'<div style="width:40px;height:40px;background:#333;display:flex;align-items:center;justify-content:center"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#787878" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="1"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5-9 9"/></svg></div>')
      +'<span onclick="pRemoveCompare(\''+uid+'\')" role="button" tabindex="0" aria-label="비교에서 '+esc(rec.it.nm)+' 빼기" style="position:absolute;top:-6px;right:-6px;width:16px;height:16px;border-radius:50%;background:#fff;color:#121212;font-size:10px;display:flex;align-items:center;justify-content:center;cursor:pointer">&#10005;</span>'
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
/* [2026-09-21 UX 진단] 비교표가 값이 같든 다르든 전부 똑같이 보여서 어느
   항목이 차이 나는지 한눈에 안 들어왔다 - 항목(행) 안에서 값이 하나라도
   다르면 그 행 데이터 칸 전체를 옅게 강조한다(칸 하나하나 다수결로 판정하면
   "2개만 비교해서 값이 둘 다 다른" 가장 흔한 경우에 아무것도 강조 안 되는
   허점이 있어 - 행 전체를 "이 항목은 서로 다르다" 기준으로 단순하게 판정).
   또 항목 이름(맨 왼쪽 칸)이 옆으로 스크롤해도 계속 보이게 고정(sticky)한다
   - 비교 대상이 3~4개면 표가 넓어져 오른쪽을 보는 동안 지금 보는 게 무슨
   항목인지 알 수 없었다. #pcmpbody가 overflow-x:auto라 sticky의 기준
   스크롤 컨테이너로 이미 맞다(사전 확인). */
function buildCompareTableHtml(resolved){
  var rows=compareRowsSpec();
  var html='<table style="width:100%;border-collapse:collapse;min-width:'+(150+resolved.length*220)+'px">';
  html+='<tr>'
    +'<th style="width:150px;position:sticky;left:0;background:#fff;z-index:1"></th>'
    +resolved.map(function(r){
      return '<th style="padding:12px;text-align:left;border-bottom:2px solid #121212;vertical-align:bottom">'
        +(r.imgSrc?'<img src="'+r.imgSrc+'" style="width:100%;aspect-ratio:1/1;object-fit:cover;margin-bottom:8px;display:block">':'')
        +'<span style="font-size:15px;line-height:1.4;font-weight:600;color:#121212;display:block">'+esc(r.it.nm)+'</span>' /* 카드 이름(.pc-name)과 같은 위계로 맞춤 */
        +'<span style="font-size:11px;line-height:1.4;color:#ABABAB">'+sciNameHtml(r.it.sc)+'</span>'
        +'</th>';
    }).join('')
    +'</tr>';
  rows.forEach(function(rowSpec){
    var values=resolved.map(function(r){return rowSpec[1](r.it,r.attrs,r.match);});
    var differs=values.some(function(v){return v!==values[0];});
    var dataBg=differs?'background:#FAFAFA;':''; /* 새 색 값을 안 만들고 사이트 기존 옅은 배경 토큰 재사용 */
    html+='<tr style="border-bottom:1px solid #E6E6E6">'
      +'<td style="padding:10px 12px;font-size:11px;letter-spacing:.5px;color:#ABABAB;font-weight:600;vertical-align:top;white-space:nowrap;position:sticky;left:0;background:#fff;z-index:1">'+esc(rowSpec[0])+(differs?' <span title="비교 대상끼리 이 항목 값이 다릅니다" style="color:'+ACCENT+'">&#9679;</span>':'')+'</td>'
      +values.map(function(v){return '<td style="padding:10px 12px;font-size:13px;color:#121212;vertical-align:top;'+dataBg+'">'+esc(v)+'</td>';}).join('')
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
  pLockScroll();
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
window.pCloseCompare=function(){document.getElementById('pcmpov').style.display='none';pUnlockScroll();};

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

/* "더 보기" 없이 전체 결과를 한 번에 카드로 그리면서도 "가장 빠르게" 요청을
   지키는 장치 - 카드 수백 개가 한꺼번에 사진·정원정보 API를 쏘면 오히려
   전체가 느려지므로, 화면 맨 위 첫 배치(8장)만 대기열을 건너뛰어 즉시
   로딩하고 나머지는 limitCard 동시요청 제한 대기열(8개씩)에 넣어 순차적으로
   채운다. (한때 "화면에 보이는 카드만" IntersectionObserver로 지연 로딩하는
   방식을 썼으나, 브라우저가 탭을 백그라운드로 인식하는 상황 등에서
   IntersectionObserver 콜백 자체가 아예 발화하지 않아 8번째 카드 이후로는
   영영 로딩되지 않는 실사용 버그가 발견되어 되돌렸다 - "스크롤해야만 겨우
   보이는" 절약보다 "항상 확실히 다 채워지는" 안정성을 우선한다. limitCard가
   이미 동시 8개로 막아주므로 결과가 아무리 많아도 브라우저 동시 연결 한도나
   정부 API 과부하 문제는 그대로 방지된다.) */
/* 결과가 한꺼번에 툭 나타나는 대신, 카드가 살짝 떠오르며 순서대로 옅게
   나타나게 한다 - "검색이 됐다"는 게 눈에 보이는 사건이 되도록. 앞쪽 카드
   10개까지만 순서를 살짝 어긋내고(그 이상은 화면 밖이라 체감이 없다) 나머지는
   한꺼번에 - 과하게 늘어지지 않도록 절제한다. 애니메이션이 끝나면 인라인
   transition을 지워, 이후 호버 등 다른 곳에서 정의한 트랜지션과 안 겹치게 한다. */
function pRevealCard(el,idx){
  var delay=Math.min(idx,10)*18;
  requestAnimationFrame(function(){
    requestAnimationFrame(function(){
      setTimeout(function(){
        el.style.opacity='1';
        el.style.transform='';
        setTimeout(function(){el.style.transition='';},360);
      },delay);
    });
  });
}
function renderPage(){
  hideLoading();
  hideAll();
  var g=document.getElementById('pgrid');
  if(pShown===0){
    g.innerHTML='';
    /* g.innerHTML=''로 예전 카드 DOM은 화면에서 떼어내지만, pCardEls는 그
       DOM 참조를 계속 붙들고 있어(uid마다 계속 누적) 자음을 여러 번 바꿀
       때마다 이미 떨어져나간 카드 수천 개가 메모리에 계속 쌓이는 누수가
       있었다 - 새 결과를 처음부터 그리는 시점(pShown===0)에 함께 비운다. */
    pCardEls={};
  }
  g.style.display='grid';
  showFilterBarIfNeeded();
  renderFilterPanel();
  /* [2026-09-23 정밀진단] "화면 첫 8장"을 예전엔 isFirstBatch(=이 renderPage
     호출이 이 검색의 첫 호출인지)로만 판정했다 - 같은 검색 안에서 소스가
     여러 번(최대 9개) 나눠 도착하면, 화면 첫 8장 자리를 실제로 채우는 카드가
     두 번째 이후 배치로 도착해도 eager를 못 받고 8개 동시제한 대기열
     (limitCard)로 밀렸다. 배치 경계가 아니라 "전체 결과에서 몇 번째 카드인가"
     (startIdx+idx)로 판정해, 어느 소스에서 왔든 화면 첫 8장은 항상 대기 없이
     바로 요청되게 한다. */
  var startIdx=pShown;
  var next=pAll.slice(pShown,pShown+PAGE_SIZE);
  next.forEach(function(it,idx){
    var eager=(startIdx+idx)<8;
    var d=document.createElement('div');
    d.className='pc';
    d.style.opacity='0';
    d.style.transform='translateY(6px)';
    d.style.transition='opacity .35s ease,transform .35s ease';
    if(it.no)d.setAttribute('data-no',it.no);
    d.setAttribute('data-origin',it.origin||'');
    d.setAttribute('data-uid',it._uid);
    d.setAttribute('data-sc',it.sc||'');
    d.onclick=function(){pDetail(it);};
    d.innerHTML='<div class="pc-img">'+PLACEHOLDER_ICON+'</div><button type="button" class="pc-cmpbtn">비교</button><div class="pc-body"><div class="pc-core">'+coreHtml(it)+'</div></div>';
    var cmpBtn=d.querySelector('.pc-cmpbtn');
    cmpBtn.onclick=function(e){e.stopPropagation();pToggleCompare(it,d);};
    g.appendChild(d);
    pRevealCard(d,idx);
    pCardEls[it._uid]={el:d};
    var imgTask=function(){
      if(!d.isConnected)return Promise.resolve(); /* 카드가 실제로 화면에서 떨어져 나간 경우에만(=진짜 새 검색/필터) 건너뛴다 - 같은 검색의 다음 배치로는 절대 취소되지 않는다 */
      return loadCardImage(it.nm,it.sc,d.querySelector('.pc-img'),function(credit){
        if(!d.isConnected)return;
        it._hasPhoto=!!credit;
        reflowGrid();
      },eager);
    };
    if(eager)imgTask(); else limitCard(imgTask); /* 첫 화면 카드는 동시요청 제한을 건너뛰어 대기 없이 바로 요청한다 */
    loadAndRenderAttrs(d,it);
    loadGardenTier(it,d);
  });
  pShown+=next.length;
  document.getElementById('pcnt').style.display='flex';
  document.getElementById('pcnttxt').textContent='총 '+pAll.length.toLocaleString()+'건 중 '+pShown+'건 표시';
  document.getElementById('pmorewrap').style.display=(pShown<pAll.length)?'block':'none';
  var b=document.getElementById('pmorebtn');if(b)b.textContent='더 보기';
  applyFilters();
  reflowGrid(); /* 사진/속성이 도착하기 전에도 rankOf(콘텐츠 충실도) 기준으로 우선 정렬 */
}

/* "팝업 열고 스크롤하면 뒤 페이지까지 움직인다" 요청 대응 - 팝업이 떠 있는
   동안 배경(body) 스크롤을 잠그고, 팝업 안(#pdpanel)은 자체 overflow-y:auto로
   계속 스크롤된다. 닫을 때 원래 스크롤 위치로 정확히 복귀시킨다(단순히
   overflow만 풀면 모바일 브라우저에서 스크롤 위치가 흔들리는 경우가 있어,
   위치를 fixed로 고정했다가 해제 시 원위치로 되돌린다). */
var pScrollLockY=0;
function pLockScroll(){
  pScrollLockY=window.scrollY||document.documentElement.scrollTop||0;
  document.body.style.position='fixed';
  document.body.style.top='-'+pScrollLockY+'px';
  document.body.style.left='0';
  document.body.style.right='0';
  document.body.style.width='100%';
}
/* body의 fixed 잠금만 풀고 스크롤 위치는 아직 건드리지 않는다 - 뒤로가기로
   상세창을 닫을 때(pHistRestoreSearch)는 이 잠금 해제 시점에 아직 검색/필터
   상태가 복원되기 전이라, 여기서 곧바로 스크롤을 옮기면 그 직후 화면이 훨씬
   짧아질 수 있는 경우(예: 검색어·필터가 하나도 없어 맨 처음 안내 화면으로
   돌아가는 경우)에 목표 지점이 이미 사라진 상태라 브라우저가 억지로 페이지
   맨 아래(푸터)로 스크롤을 눌러버린다("팝업을 닫으면 하단으로 나온다" 버그의
   원인) - 실제 스크롤 복원은 화면이 최종 높이로 자리잡은 뒤로 미룬다. */
function pUnlockScrollBody(){
  document.body.style.position='';
  document.body.style.top='';
  document.body.style.left='';
  document.body.style.right='';
  document.body.style.width='';
}
/* 복원하려는 위치(pScrollLockY)가 현재(어쩌면 더 짧아진) 문서 높이를 넘으면
   그 값 그대로 scrollTo를 부르는 순간 브라우저가 최대치인 맨 아래로 클램프
   해버린다 - 문서의 실제 최대 스크롤 값으로 한 번 눌러(clamp) 그 함정을
   피한다. */
function pClampedScrollY(){
  return Math.max(0,document.documentElement.scrollHeight-window.innerHeight);
}
function pUnlockScroll(){
  pUnlockScrollBody();
  window.scrollTo(0,Math.min(pScrollLockY,pClampedScrollY()));
}
/* 상세창을 닫을 때, 그 창을 열며 남긴 히스토리 항목이 있으면(history.back)
   그걸 소비하도록 뒤로가기를 호출한다 - popstate 핸들러(pOnPopState/
   pHistRestoreSearch)가 실제로 창을 숨기고 이전 검색 상태를 복원해준다.
   히스토리 상태가 없는 예외 상황(예: 구형 브라우저)에는 예전처럼 직접 닫는다. */
window.pCD=function(){
  if(history.state&&history.state.type==='detail'){history.back();return;}
  pHidePov();pUnlockScroll();
};

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
var ORIGIN_BADGE_TXT={spclt:'특산식물',rare:'적색식물',naturalized:'외래식물',folk:'민속식물',seed:'종자정보',plantnet:'Pl@ntNet 인식'};

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
  /* [백로그 38 P2-C] 요약 카드 - 광조건/수분은 profile(동기, curated
     dataset)에서, 키/개화기는 발간도서에서, 난이도는 농사로 실내정원
     목록에서 각각 다른 타이밍에 온다. 값이 있는 것만 pdSummaryHtml이
     걸러 보여주므로 여기선 그냥 다 모아 던지면 된다. */
  Promise.all([
    bookSummaryFields(sc),
    nongsaroDataReady.then(function(){var g=nongsaroGardenByName(nm);return (g&&g.managelevelCodeNm)||'';}).catch(function(){return '';})
  ]).then(function(res){
    var bk=res[0]||{},level=res[1]||'';
    setEl('pdsummary',pdSummaryHtml({
      sunlight:profile&&profile.sunlight,
      moisture:profile&&profile.moisture,
      height:bk.height,
      bloom:bk.bloom,
      level:level
    }));
  }).catch(function(){});
  /* nongsaroGeneralHtml(꽃장식/실내정원 만들기/동영상강좌/좋아하는 꽃)는 이미
     완성돼 있었지만 이 파이프라인 어디에서도 호출되지 않아 화면에 전혀
     나오지 않던 죽은 코드였다 - NONGSARO_API_KEY 복구로 데이터 자체는 이미
     정상이라, 여기서 불러다가 같은 성격의 기존 슬롯(pdnsgarden)에 이어
     붙인다. 새 슬롯을 만들려면 Webflow 임베드 쪽 HTML도 같이 고쳐야 해서,
     당장 반영 가능한 기존 슬롯 재사용 쪽을 택했다. */
  var generalData=nongsaroGeneralHtml(nm);
  var tourData=tourSpotsHtml(nm);
  Promise.all([nsData,Promise.resolve(extraAcademicHtml||''),bookData,storyData,generalData,tourData]).then(function(res){
    var ns=res[0]||{},extra=res[1]||'',bk=res[2]||{},fs=res[3]||'',general=res[4]||'',tour=res[5]||'';
    setEl('pdnsgarden',(ns.gardenHtml||'')+general);
    setEl('pdnslandscape',ns.landscapeHtml||'');
    setEl('pdbookgarden',bk.gardenHtml||'');
    setEl('pdbooklandscape',bk.landscapeHtml||'');
    var rarityRowsArr=pdRarityRows(match);
    var rarityTable=rarityRowsArr.length?rowsTable(rarityRowsArr):'';
    var badges=pdRarityBadgesHtml(match);
    var academicInner=badges+rarityTable+extra+(ns.academicHtml||'');
    var hasAcademic=!!(badges||rarityTable||extra||ns.academicHtml);
    setEl('pdacademic',hasAcademic?uiSection('학술정보',academicInner):'');
    setEl('pdtourspots',tour);
    setEl('pdstory',(bk.storyHtml||'')+fs);
  }).catch(function(){
    setEl('pdstory','');
  });
}

/* [2026-09-19] 대표 요청: 상세창이 display:none↔flex로 즉시 전환돼 열고 닫는
   느낌이 없었다(transition:all이 있어도 display 전환 자체엔 무효). 데스크톱은
   살짝 아래에서 페이드업, 모바일(≤640px)은 시트가 아래에서 올라오는 방식으로
   연다. class를 넣은 채로 display만 바꾼 뒤 다음 프레임에 class를 빼서
   transition이 실제로 발동하게 한다(카드 등장 애니메이션의 pRevealCard와
   같은 이중 rAF 패턴). prefers-reduced-motion이면 즉시 전환. 카드 그리드
   호버 모션(디자인 세션 mgpguidemotion)과 선택자가 겹치지 않도록 #pov/
   #pdpanel에만 건다.

   [백로그 38 P1] 비즈니스 세션 390px 실측 진단(팝업-UX-진단-2026-09-19.md)
   반영 - 모바일(≤640px)을 데스크톱 모달 축소판이 아니라 전체화면 바텀시트로:
   #pdpanel을 화면 하단에 고정하고(92dvh), 닫기 버튼을 44px로 키우고(원본
   임베드가 28px 인라인 스타일이라 !important 필요), 스크롤 60px 지나면
   헤더를 컴팩트 바로 줄인다(큰 헤더의 사진 오버레이 재구성까지는 이번 P1
   범위에서 뺌 - 배지·학명 숨기고 이름만 작게). 그립은 "창 옮기기" 대신
   "아래로 끌어서 닫기" 제스처로 의미를 바꿔 계속 쓴다(initDrag 참고). */
var POV_ANIM_MS=200;
/* [2026-09-20 고급 디자인 스킬 점검] 전환 속도 곡선이 전부 기본값(ease)이라
   밋밋했다 - "빠르게 시작해서 부드럽게 멈추는" 곡선(오버슈트 없음, 튀어
   보이지 않아 데이터 도구엔 이쪽이 안전)으로 바꾼다. 시간(ms)은 그대로 두고
   곡선만 바꾼 것 - CSS 트랜지션은 곡선이 뭐든 선언된 시간이 지나면 똑같이
   끝나므로, 이 시간과 맞춰 둔 JS setTimeout(POV_ANIM_MS 등)은 그대로 맞는다. */
var EASE_CURVE='cubic-bezier(.16,1,.3,1)';
/* [재발 방지, 총괄 세션 제안 2026-09-21] 이 함수는 상세창을 열 때만
   실행된다(pShowPov 등에서 호출) - #pgrid .pc·.pc-cmpbtn·#pcmpbar·
   .pfsum-chip 등 "검색 결과 화면"에서 상세창과 무관하게 항상 필요한
   스타일을 여기 넣으면, 상세창을 한 번도 안 연 방문자에게는 그 스타일이
   영영 안 먹는다(실제로 있었던 버그, B3 카드 2열·오늘 mgpguidecolor/
   motion 병합 때 둘 다 이 함정에 걸렸었음 - 커밋 6e5d57d 참고). 여기엔
   #pov/#pdpanel/#pdhead/#pdcompact/.pdjump-chip/.ui-clamp 등 상세창을
   열어야만 화면에 존재하는 요소의 스타일만 넣는다 - 검색결과 화면
   요소는 페이지 로드 시 즉시 실행되는 블록(아래, #psi 스타일과 같은
   자리)에 넣을 것. */
function pEnsurePovAnimStyle(){
  if(document.getElementById('pov-anim-style'))return;
  var s=document.createElement('style');
  s.id='pov-anim-style';
  s.textContent=
    '#pov{transition:opacity '+POV_ANIM_MS+'ms '+EASE_CURVE+'}'
    +'#pov.p-anim-hidden{opacity:0;pointer-events:none}' /* 닫히는 중엔 뒤로 겹쳐 보이는 검색결과 클릭을 막지 않는다 */
    +'#pdpanel{transition:transform '+POV_ANIM_MS+'ms '+EASE_CURVE+',opacity '+POV_ANIM_MS+'ms '+EASE_CURVE+'}'
    +'#pdpanel.p-anim-hidden{opacity:0;transform:translateY(24px)}'
    +'#pdhead{transition:padding .2s '+EASE_CURVE+';z-index:2}' /* sticky 헤더가 뒤의 #pdimg에 덮이던 문제(z-index:auto) 수정 - 비즈니스 세션 390 실측 지적 */
    +'#pdcompact{display:none;touch-action:none}' /* [2026-09-19 대표 2차 실기기 피드백 - 옵션 A(구조)] 큰 헤더 자체를 컴팩트로 줄이던 방식(패딩·폰트 전환)은 스크롤 경계(60px)를 넘나들 때마다 높이가 122↔56으로 출렁이고 떨렸다. 헤더를 sticky에서 풀어 콘텐츠와 함께 스크롤되게 하고, 높이가 전혀 안 바뀌는 별도의 56px 바를 opacity로만 나타나게 한다(모바일 전용, 아래 media 블록) - 원리적으로 튐·떨림이 없다. 데스크톱에선 계속 display:none */
    +'#pdcompact button{width:44px!important;height:44px!important;font-size:15px!important;position:absolute;top:6px;right:6px;display:flex!important;align-items:center;justify-content:center;touch-action:auto}'
    +'.pdjump-chip{flex:0 0 auto;padding:14px 12px;font-size:11px;font-weight:600;letter-spacing:.3px;color:#ABABAB;cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap;transition:color .15s '+EASE_CURVE+'}' /* [백로그 38 P2-D] 섹션 점프 칩 - #pdtabbar(기존 빈 슬롯) 되살림 */
    +'.pdjump-chip:hover{color:#121212}'
    +'.pdjump-chip.pdjump-active{color:'+ACCENT+';border-bottom-color:'+ACCENT+'}' /* 선택 상태에만 포인트 그린(원칙 유지) */
    +'#pdsummary,#pdbody,#pdenv,#pdtourspots,#pdacademic{scroll-margin-top:160px}' /* [백로그 38 P2-D 후속] 점프해도 섹션 첫 줄이 sticky 헤더(데스크톱 146px) 뒤로 들어가던 문제 - 비즈니스 세션 지적 */
    +'.pdjump-chip:active{opacity:.6}'
    +'.ui-clamp-btn{transition:opacity .15s '+EASE_CURVE+'}'
    +'.ui-clamp-btn:active{opacity:.6}'
    +'.pd-slide-arrow{transition:transform .15s '+EASE_CURVE+'}'
    +'.pd-slide-arrow:active{transform:translateY(-50%) scale(.85)!important}' /* 인라인 translateY(-50%)를 지키면서 눌림만 더한다 */
    +'#pdhead button,#pdcompact button{transition:transform .15s '+EASE_CURVE+'}'
    +'#pdhead button:active,#pdcompact button:active{transform:scale(.88)}'
    /* [2026-09-20] 상세창을 스크롤해 내려갈 때 재배·조경 정보 같은 섹션이
       뚝 나타나는 대신 살짝 떠오르며 나타난다(카드 첫 등장 효과와 같은 원리).
       opacity/transform은 레이아웃 크기에 영향을 안 줘서 setEl의 스크롤
       보정·pApplyClamps의 높이 측정과 안 부딪힌다(사전 확인함). pdBindSectionReveal
       이 실제 동작을 맡는다 - 스크롤을 IntersectionObserver로 감시하는 방식은
       예전에 "탭이 백그라운드로 인식되면 콜백이 아예 안 불리는" 실사용 버그로
       되돌린 전례가 있어(위 주석 참고) 이미 검증된 순수 scroll 이벤트 방식을
       그대로 재사용한다. */
    +'#pdsummary,#pdcore,#pdenv,#pdplanting,#pdbody,#pdlandscape,#pdnsgarden,#pdnslandscape,#pdbookgarden,#pdbooklandscape,#pdacademic,#pdtourspots,#pdstory{opacity:0;transform:translateY(10px);transition:opacity .4s '+EASE_CURVE+',transform .4s '+EASE_CURVE+'}'
    +'#pdsummary.pd-revealed,#pdcore.pd-revealed,#pdenv.pd-revealed,#pdplanting.pd-revealed,#pdbody.pd-revealed,#pdlandscape.pd-revealed,#pdnsgarden.pd-revealed,#pdnslandscape.pd-revealed,#pdbookgarden.pd-revealed,#pdbooklandscape.pd-revealed,#pdacademic.pd-revealed,#pdtourspots.pd-revealed,#pdstory.pd-revealed{opacity:1;transform:none}'
    +'@media (max-width:640px){'
    +'.pd-slide-arrow{display:none!important}' /* [UX 미세점검 C3] 모바일은 스와이프로 충분하니 화살표는 숨긴다 - 카운터 칩이 "여러 장" 단서를 대신한다. 버튼 자체에 인라인 display:flex가 있어(renderImageSlider) !important 없이는 안 이겼다(비즈니스 세션 390 실측 지적) */
    +'#pdtabbar{position:sticky;top:56px;background:#fff;z-index:1}' /* 컴팩트 헤더(56px) 바로 아래 고정 */
    +'#pdsummary,#pdbody,#pdenv,#pdtourspots,#pdacademic{scroll-margin-top:100px}' /* 컴팩트 헤더 56px + 칩 바 높이 포함 */
    +'.ui-rowtable,.ui-rowtable tbody,.ui-rowtable tr,.ui-rowtable td{display:block;width:auto}' /* [백로그 38 P2-F] 라벨 30%/값 70% 2열 표가 좁아 값이 줄바꿈되던 문제 - 1열로 쌓는다 */
    +'.ui-rowtable tr{border-bottom:1px solid #E6E6E6;padding:12px 0}'
    +'.ui-rowtable td{padding:0!important}'
    +'.ui-rowtable td:first-child{color:#6E6E6E;font-size:11px;margin-bottom:4px}' /* 사이트 기존 회색 토큰(새 회색 추가 금지, 디자인 세션 09-19 확인) */
    +'.ui-rowtable td:last-child{font-size:15px;padding-top:4px!important}'
    +'.env-bar .env-opt:not(.env-opt-active){display:none}' /* [백로그 38 P2-G] 흰 테두리 버튼 3개가 눌러도 되는 것처럼 보인다는 지적 - 선택 안 된 옵션은 숨기고 선택값 하나만 칩으로 */
    +'.env-bar .env-opt-active{flex:none!important;padding:6px 14px!important;border-radius:14px!important;font-weight:600}'
    +'#pov{padding:0;align-items:flex-end}'
    +'#pdpanel{position:fixed;left:0;right:0;bottom:0;top:auto;width:100%;max-width:100%;height:92dvh!important;max-height:92dvh!important;margin:0;border-radius:16px 16px 0 0}' /* 인라인 max-height:88vh를 이겨야 해서 !important */
    +'#pdpanel.p-anim-hidden{opacity:1;transform:translateY(100%)}'
    +'#pdhead{touch-action:none}' /* 드래그다운 제스처 초반에 브라우저가 세로 스크롤로 가로채 가지 않도록(대표 실기기 "불안정" 제보 원인) - 닫기 버튼은 아래에서 다시 auto로 되돌린다 */
    +'#pdhead button{width:44px!important;height:44px!important;font-size:15px!important;top:6px!important;right:6px!important;display:flex!important;align-items:center;justify-content:center;touch-action:auto}'
    +'#pdhead{position:static!important}' /* 큰 헤더를 sticky에서 풀어 콘텐츠와 함께 스크롤되게 한다 - 높이가 전혀 안 바뀌는 #pdcompact 바가 그 역할을 대신 맡는다 */
    +'#pdcompact{display:flex;position:sticky;top:0;z-index:3;align-items:center;padding:10px 60px 10px 20px;background:'+ACCENT+';color:#fff;height:56px;margin-bottom:-56px;box-sizing:border-box;opacity:0;pointer-events:none;transition:opacity .15s ease}' /* [2026-09-19 대표 3차 실기기 제보 "초록 헤더 위 흰 줄"] opacity:0은 화면엔 안 보여도 레이아웃 자리는 그대로 차지한다 - #pdhead 앞에서 56px를 항상 먹어치워 흰 여백처럼 보였다(디자인 세션이 스크린샷으로 잡아냄). margin-bottom을 자기 높이만큼 음수로 줘서 뒤에 오는 #pdhead를 그만큼 끌어올려 순 차지 공간을 0으로 만든다 - sticky는 이 "원래 있어야 했을 자리"를 기준으로 top:0에 붙으므로 스크롤 동작은 그대로 유지된다 */
    +'#pdcompact.pdcompact-visible{opacity:1;pointer-events:auto}'
    +'#pdcompact button{background:rgba(255,255,255,.1)!important;color:#fff!important;border:0!important}' /* [2026-09-19 대표 실기기 "엑스박스 깨짐"] 이 버튼은 JS가 만들어서 인라인 스타일이 없어(큰 헤더 ✕는 Webflow 임베드 인라인 스타일로 이미 되어있음) 사이트 전역 button 스타일(연회색 불투명 배경)을 그대로 물려받아 초록 바 위에 흰 ✕가 안 보이는 회색 네모로 보였다 - 큰 헤더 ✕와 같은 배경/색으로 맞춘다 */
    +'.ui-clamp{-webkit-line-clamp:4;display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden;transition:max-height .2s ease-out}' /* [UX 미세점검 C2] 펼침/접힘 애니메이션 - max-height를 pToggleClamp가 조작한다 */
    +'.ui-clamp-btn{padding:12px 0}' /* 탭 영역 44px 확보 - 비즈니스 세션 지적. display는 JS(pApplyClamps)가 인라인으로 토글하므로 여기선 안 건드린다 */
    +'}'
    +'@media (prefers-reduced-motion:reduce){#pov,#pdpanel,#pdhead,#pdcompact,.ui-clamp,.pdjump-chip,.ui-clamp-btn,.pd-slide-arrow,#pdhead button,#pdcompact button,#pdsummary,#pdcore,#pdenv,#pdplanting,#pdbody,#pdlandscape,#pdnsgarden,#pdnslandscape,#pdbookgarden,#pdbooklandscape,#pdacademic,#pdtourspots,#pdstory{transition:none}}'; /* #pgrid .pc·.pc-cmpbtn·#pcmpbar 등 검색결과 화면 요소의 reduced-motion은 페이지 로드 시 즉시 실행되는 별도 블록(아래)에서 같이 처리 - 이 함수 자체가 상세창을 열 때만 실행돼 그쪽엔 안 맞다 */
  document.head.appendChild(s);
}
/* [2026-09-19 대표 2차 실기기 피드백 - 옵션 A] #pdhead 자체의 높이를 바꾸던
   첫 시도는 스크롤 경계를 넘나들 때마다(특히 드래그로 위아래를 오갈 때)
   출렁이고 떨렸다. 대신 높이가 고정된 별도 56px 바(#pdcompact)를 항상
   DOM에 두고 opacity만 0↔1로 바꾼다 - 어떤 경우에도 레이아웃 크기 자체는
   변하지 않으므로 원리적으로 튐이 없다. #pdhead는 이제 sticky를 풀어
   콘텐츠와 함께 그냥 스크롤된다. */
function panelIsSheetDragging(){
  var p=document.getElementById('pdpanel');
  return !!(p&&p.dataset.sheetDragging==='1');
}
function pdEnsureCompactBar(){
  var bar=document.getElementById('pdcompact');
  if(bar)return bar;
  var head=document.getElementById('pdhead');
  if(!head||!head.parentNode)return null;
  bar=document.createElement('div');
  bar.id='pdcompact';
  bar.innerHTML=
    '<div id="pdcompactgrip" style="position:absolute;top:6px;left:50%;transform:translateX(-50%);width:36px;height:4px;background:rgba(255,255,255,.3);border-radius:2px"></div>'
    +'<span id="pdcompactname" style="font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></span>'
    +'<button onclick="pCD()" aria-label="상세창 닫기">&#10005;</button>';
  head.parentNode.insertBefore(bar,head);
  return bar;
}
/* #pdpanel/#pdhead는 페이지에 하나뿐인 고정 요소라 리스너를 한 번만 건다
   (상세창을 여닫을 때마다 다시 만들어지는 요소가 아님). CSS가 이 상태를
   모바일(≤640px)에서만 보이게 하므로 데스크톱에서는 클래스가 붙어도 눈에
   보이는 변화가 없다. */
function pBindHeadCompact(){
  var scroller=document.getElementById('pdpanel'),head=document.getElementById('pdhead');
  var bar=pdEnsureCompactBar();
  if(!scroller||!head||!bar||scroller.dataset.compactBound)return;
  scroller.dataset.compactBound='1';
  scroller.addEventListener('scroll',function(){
    if(panelIsSheetDragging())return; /* 드래그 중엔 컴팩트 전환을 잠근다(2차 실기기 피드백) */
    bar.classList.toggle('pdcompact-visible',scroller.scrollTop>60);
  },{passive:true});
}
function pShowPov(){
  pEnsurePovAnimStyle();
  pBindHeadCompact();
  var ov=document.getElementById('pov'),panel=document.getElementById('pdpanel');
  if(!ov||!panel)return;
  var head=document.getElementById('pdhead'); /* 컴팩트 바 초기화는 pDetail에서 pdEnsureCompactBar 호출 시 함께 처리 */
  panel.style.transform='';panel.style.transition=''; /* 직전 드래그다운 제스처가 남긴 인라인 transform 잔존 방지(대표 실기기 "불안정" 제보 원인 중 하나) */
  ov.style.opacity='';ov.style.pointerEvents='';ov.style.transition=''; /* 드래그 중 손가락 위치에 맞춰 직접 건드린 배경 opacity/pointerEvents 잔존 방지(2차 실기기 피드백 원인 중 하나) */
  panel.dataset.sheetDragging='';if(head)head.style.transition='';
  ov.classList.add('p-anim-hidden');panel.classList.add('p-anim-hidden');
  ov.style.display='flex';
  var revealed=false;
  function reveal(){if(revealed)return;revealed=true;ov.classList.remove('p-anim-hidden');panel.classList.remove('p-anim-hidden');}
  /* 탭이 백그라운드로 밀려 rAF가 안 도는 드문 경우에도 패널이 opacity:0로
     영영 안 보이는 상태로 남지 않도록, setTimeout을 안전망으로 같이 건다
     (둘 중 먼저 오는 쪽이 실행 - revealed 플래그로 중복 실행만 막는다). */
  requestAnimationFrame(function(){requestAnimationFrame(reveal);});
  setTimeout(reveal,POV_ANIM_MS);
}
function pHidePov(){
  var ov=document.getElementById('pov'),panel=document.getElementById('pdpanel');
  if(!ov||ov.style.display==='none')return;
  pEnsurePovAnimStyle();
  ov.classList.add('p-anim-hidden');if(panel)panel.classList.add('p-anim-hidden');
  setTimeout(function(){
    ov.style.display='none';
    ov.classList.remove('p-anim-hidden');if(panel)panel.classList.remove('p-anim-hidden');
  },POV_ANIM_MS);
}
window.pDetail=function(it){
  pHistPushDetail(it._uid); /* 뒤로가기로 이 상세창을 닫을 수 있도록 히스토리에 기록 */
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
  var pdNameText=hasKorNm?nm:(sc||'이름 미확인');
  document.getElementById('pdname').textContent=pdNameText;
  var compactBar=pdEnsureCompactBar();
  if(compactBar){var cn=document.getElementById('pdcompactname');if(cn)cn.textContent=pdNameText;compactBar.classList.remove('pdcompact-visible');} /* 새로 열 때마다 스크롤 0에서 시작하니 컴팩트 상태도 초기화 */
  if(hasKorNm&&sc){sciEl.innerHTML=sciNameHtml(sc);sciEl.style.display='';}
  else{sciEl.textContent='';sciEl.style.display='none';}
  document.getElementById('pdbadge').textContent=no?'식물도감':(specsId?'식물표본':(ORIGIN_BADGE_TXT[origin]||'커뮤니티 데이터'));
  pdSet(overviewSkeleton());
  pdBindSectionReveal();
  setPdCore(sc,'','');
  var tabbarEl=pdEnsureTabbar();
  if(tabbarEl){tabbarEl.innerHTML=pdJumpChipsHtml();pdBindJumpObserver();}
  var creditEl=document.getElementById('pdcredit');
  creditEl.style.display='none';
  pShowPov();
  pLockScroll();
  var pdimg=document.getElementById('pdimg');
  pdimg.innerHTML=PLACEHOLDER_ICON;
  /* 상세창은 카드 그리드용 대표 사진 1장이 아니라, 여러 소스를 모두 훑어
     가능한 만큼 모은 사진을 슬라이드로 보여준다("가능한 많은 이미지"). 6개
     출처(국립수목원/농사로/위키/iNaturalist/GBIF/수피)가 도착하는 대로
     매번 그 시점까지 모인 사진으로 슬라이드를 다시 그린다 - 국립수목원/농사로
     매칭이 없는 종(커뮤니티 데이터 등)도 가장 먼저 답한 출처의 사진을
     최대한 빨리 보여주고, 이후 더 신뢰도 높은 출처가 도착하면 자연스럽게
     앞쪽으로 재정렬된다("사진이 늦게 나온다"는 지적 대응). */
  var photoRenderToken=++pDetailToken;
  fetchAllPhotos(nm,sc,function(photos){
    if(pDetailToken!==photoRenderToken)return;
    if(photos.length)renderImageSlider(pdimg,creditEl,photos);
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
    var url2=buildUrl('/plantSmplUnitList',{pageNo:1,numOfRows:5,reqPlantSpecsId:specsId});
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
  } else if(origin==='plantnet'){
    /* 사진으로 찾기 결과 중 국립수목원 도감에 등록되지 않은 종 - Pl@ntNet이
       직접 알려준 학명·영문명·과명만 있고 별도 상세조회 API가 없다. 이름 칸의
       한글은 영문 커먼네임을 번역한 것임을 분명히 밝혀 오해를 줄인다. */
    var engNote=it.engNm?('Pl@ntNet이 알려준 영문명 "'+esc(it.engNm)+'"을(를) 한글로 옮긴 이름입니다. '):'';
    setEl('pdbody','<p style="color:#787878;font-size:13px;text-align:center;padding:20px 0;line-height:1.7">국립수목원 도감·표본 자료에는 없는 종으로, 사진 인식(Pl@ntNet)으로 찾은 항목입니다. '+engNote+'형태·분포 등 상세 설명은 제공되지 않습니다.</p>');
    staticDataReady.then(function(){
      var match=getStaticMatch(sc);
      var profile=match?deriveCuratedProfile({},match):null;
      setPdCore(sc,(match&&match.name&&match.name.family)||it.fam||'',it.engNm||'');
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
  var compactBar=pdEnsureCompactBar(); /* 큰 헤더가 스크롤로 밀려나면 컴팩트 바가 대신 보이므로, 아래로 끌어 닫는 제스처도 컴팩트 바에 똑같이 걸어야 한다 */
  if(!panel||!head)return;
  var dragging=false,moved=false,startX=0,startY=0,startLeft=0,startTop=0,startTime=0,lastDy=0;
  function onDown(e){
    if(e.target.closest('button'))return; /* 닫기 버튼은 드래그 대상에서 제외 */
    var pt=e.touches?e.touches[0]:e;
    var rect=panel.getBoundingClientRect();
    dragging=true;moved=false;lastDy=0;
    startX=pt.clientX;startY=pt.clientY;startTime=Date.now();
    startLeft=rect.left;startTop=rect.top;
    head.style.cursor='grabbing';
    if(grip)grip.style.cursor='grabbing';
  }
  /* [백로그 38 P1] ≤640px에서는 #pdpanel이 화면에 고정된 바텀시트라 "창을
     옮긴다"는 개념 자체가 없다(진단 문서: "폰에서 창 이동은 무의미"). 그립을
     장식으로 남겨 어포던스만 틀리게 두느니, 같은 아래로 끄는 동작을 "시트
     닫기"로 새로 연결한다 - 아래로 끌면 손가락을 따라 시트가 내려가고,
     80px 이상 끌고 놓으면 닫히며, 못 미치면 원위치로 되돌아온다.
     [2026-09-19 실기기 불안정 제보 수정] 대표가 "닫히긴 하는데 불안정하다"고
     확인해줘서 비즈니스 세션이 짚어준 원인 5개를 고친다: (1) 닫을 때 dy
     위치에서 그대로 pCD()만 불러 인라인 transform이 안 지워지고 다음에 열
     때 그 자리에서 다시 시작됐다 - 이제 남은 거리를 마저 애니메이션으로
     내려보낸 뒤에만 닫는다(finishSheetDrag). (2) touchcancel을 안 받아
     브라우저가 제스처를 가로채면 dragging=true로 낀 채 남았다 - 캔슬도
     onUp과 같은 정리를 거치게 한다. (3) 위로 살짝 흔들리는 첫 움직임에
     preventDefault를 안 해 브라우저가 스크롤로 확정해버릴 수 있었다 -
     #pdhead에 touch-action:none(CSS, pEnsurePovAnimStyle)을 걸어 애초에
     제스처를 뺏기지 않게 하고, JS에서도 방어적으로 preventDefault한다.
     (4) 80px 고정 임계값만 보고 짧고 빠르게 튕기는 제스처를 안 닫았다 -
     속도 조건을 더한다. (5) onUp의 changedTouches 의존을 없애고 onMove가
     매번 저장해두는 lastDy를 그대로 쓴다. */
  function isMobileSheet(){return window.innerWidth<=640;}
  /* [2026-09-19 대표 2차 실기기 피드백 "손 떼는 동작이 부자연스럽다"]
     비즈니스 세션이 코드로 짚은 3가지:
     1) 백드롭이 시트와 따로 논다 - 시트는 180ms에 다 내려갔는데 어두운
        배경은 그 다음에야 pHidePov가 200ms 더 걸려 걷혀 "두 박자"로 보임.
        → 드래그 중에도 손가락 위치에 맞춰 배경을 같이 옅게 하고, 닫을 때도
        시트 이동과 배경 페이드를 한 애니메이션으로 동시에 재생한다.
     2) 드래그 도중 컴팩트 헤더 전환(padding 트랜지션)이 같이 끼어들면
        헤더 높이가 출렁인다 - 드래그 중엔 컴팩트 토글을 잠그고(panel의
        data attribute로 pBindHeadCompact 스크롤 핸들러에 신호) 헤더
        자체의 padding transition도 끈다.
     3) 위로 끌면 touch-action:none 때문에 정말 아무 반응이 없었다 -
        네이티브 스크롤을 대신 돌려줄 방법이 없어(CSS touch-action엔
        "아래로만 허용" 값이 없음), 최소한 눈에 보이는 반응(작게 튕겼다
        돌아오는 저항)을 준다. 닫힘 판정은 여전히 실제(감쇠 전) dy 기준이라
        위로 끈 건 항상 스냅백된다.
     덤: 손가락을 1:1로 그대로 따라가면 뻣뻣해 보인다는 지적 - 시각적
     이동에만 0.85 감쇠를 주고(닫힘 판정 임계값은 감쇠 전 실제 dy 그대로). */
  function onMove(e){
    if(!dragging)return;
    var pt=e.touches?e.touches[0]:e;
    var dx=pt.clientX-startX,dy=pt.clientY-startY;
    if(isMobileSheet()){
      var ov=document.getElementById('pov');
      if(dy<=0){
        moved=true;lastDy=dy;
        panel.dataset.sheetDragging='1';
        panel.style.transition='none';head.style.transition='none';
        var upDamped=Math.max(dy*0.3,-24); /* 위로 끌어도 최대 24px까지만 살짝 들리는 저항 반응 - 항상 스냅백(닫히지 않음) */
        panel.style.transform='translateY('+upDamped+'px)';
        e.preventDefault();
        return;
      }
      moved=true;lastDy=dy;
      panel.dataset.sheetDragging='1';
      panel.style.transition='none';head.style.transition='none';
      panel.style.transform='translateY('+(dy*0.85)+'px)';
      if(ov){ov.style.transition='none';ov.style.opacity=String(Math.max(0,1-dy/(panel.offsetHeight||600)));}
      e.preventDefault();
      return;
    }
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
  function finishSheetDrag(shouldClose){
    var ov=document.getElementById('pov');
    panel.style.transition='transform 180ms ease-out';
    if(ov)ov.style.transition='opacity 180ms ease-out';
    if(shouldClose){
      panel.style.transform='translateY(100%)';
      if(ov){ov.style.opacity='0';ov.style.pointerEvents='none';} /* 시트가 내려가는 것과 배경이 걷히는 것을 같은 180ms로 동시 재생 - 따로 놀던 "두 박자" 닫힘 해소. pointerEvents는 클래스(.p-anim-hidden)가 아직 안 붙은 전환 구간에도 뒤 검색결과 클릭을 막지 않기 위해 미리 끈다 */
      setTimeout(function(){
        window.pCD();
        panel.style.transition='';panel.style.transform='';
        if(ov){ov.style.transition='';ov.style.opacity='';}
        panel.dataset.sheetDragging='';head.style.transition='';
      },180);
    } else {
      panel.style.transform='';
      if(ov)ov.style.opacity='';
      setTimeout(function(){
        panel.style.transition='';
        if(ov)ov.style.transition='';
        panel.dataset.sheetDragging='';head.style.transition='';
      },180);
    }
  }
  function onUp(){
    if(isMobileSheet()&&moved){
      var elapsed=Math.max(1,Date.now()-startTime);
      var velocity=lastDy/elapsed; /* px/ms */
      finishSheetDrag(lastDy>80||(lastDy>24&&velocity>0.5));
    }
    dragging=false;moved=false;
    head.style.cursor='grab';
    if(grip)grip.style.cursor='grab';
  }
  function onCancel(){
    /* 제스처가 브라우저에 가로채여 끊긴 경우 - 닫지 않고 안전하게 원위치로만 되돌린다 */
    if(isMobileSheet()&&moved)finishSheetDrag(false);
    dragging=false;moved=false;
    head.style.cursor='grab';
    if(grip)grip.style.cursor='grab';
  }
  head.addEventListener('mousedown',onDown);
  head.addEventListener('touchstart',onDown,{passive:true});
  if(compactBar){
    compactBar.addEventListener('mousedown',onDown);
    compactBar.addEventListener('touchstart',onDown,{passive:true});
  }
  window.addEventListener('mousemove',onMove,{passive:false});
  window.addEventListener('touchmove',onMove,{passive:false});
  window.addEventListener('mouseup',onUp);
  window.addEventListener('touchend',onUp);
  window.addEventListener('touchcancel',onCancel);
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
/* [2026-09-19 UX 미세점검 B2·B5] #psi(검색창)·.pc-cmpbtn(비교 버튼)이
   Webflow 임베드 쪽 정적 스타일에 있어 GitHub Pages 배포만으로는 못
   고친다(#pdtabbar와 같은 위치 문제) - 페이지 로드 시 한 번 CSS를 얹어
   우회한다. #psi는 16px 미만이면 iOS가 포커스 시 화면을 확대해버려서
   16px로, 탭 영역은 44px 최소 높이로. .pc-cmpbtn은 40×27px·10px 글자라
   탭 영역이 좁았던 것을 32px 이상·12px로. */
(function(){
  var s=document.createElement('style');
  s.textContent=
    '#psi{font-size:16px!important;min-height:44px!important;box-sizing:border-box}'
    +'.pc-cmpbtn{min-height:32px!important;font-size:11px!important;padding:8px 12px!important;box-sizing:border-box}'
    +'.pc-name,.pc-sci,.pc-fam{line-height:1.4}'; /* [2026-09-21 타이포그래피 리듬] 카드 이름·학명·과명(임베드 쪽 정적 스타일)에 줄 간격이 아예 없어 상세창 본문(1.7~1.8)과 리듬이 달랐다 - 카드 텍스트는 한 줄로 잘리는(nowrap+ellipsis) 짧은 제목류라 1.4로 */
  document.head.appendChild(s);
})();
/* [2026-09-21 UX 진단 B3] 실측(390px): 카드 한 장 560px(사진 1:1 356px)라
   화면당 1.5장만 보여 11건에 6,000px씩 스크롤해야 했다. 라이브 CSS를 직접
   확인해보니 #pgrid는 이미 ≤768px에서 2열인데, ≤480px(대부분의 실제
   휴대폰 폭)에서만 다시 1열로 되돌리는 규칙이 Webflow 임베드에 따로
   있었다. 카드 절반 폭에 맞춰 사진 비율을 1:1→4:3(세로 압축)로, 본문
   패딩·글자 크기를 비례해 줄인다. **여기 두는 이유**: 위 #psi 블록과
   똑같이 카드 그리드는 검색 결과가 처음 뜰 때부터 바로 적용돼야 하는데,
   pEnsurePovAnimStyle()은 상세창을 열 때(pDetail)만 불려서 처음엔 이
   스타일 자체가 DOM에 없다 - 거기 넣었다면 첫 화면에서는 2열이 전혀 안
   먹고, 나중에 상세창을 처음 열 때 갑자기 레이아웃이 바뀌는 문제가
   있었을 것(직접 확인 후 옮김).
   [배포 뒤 실기기 실측으로 드러난 버그, 총괄 세션이 잡아줌] #pgrid
   부분만 라이브에서 1열 그대로였다 - Webflow 임베드의 같은 규칙
   (`#pgrid{grid-template-columns:1fr!important}`)이 body 안 <style>에
   있고, 이 스타일은 head에 넣는데 CSS 우선순위는 실행 시점이 아니라
   "문서 안에서 더 뒤에 오는 쪽"이 이긴다 - head는 항상 body보다 문서상
   앞이라, 선택자 구체성과 !important가 완전히 같으면 body 쪽(임베드)이
   항상 이겼다(.pc-img/.pc-body 등 다른 줄은 임베드 쪽에 !important가
   없어 문제 없었음 - #pgrid만 유일하게 !important끼리 부딪혔다). 고쳐서
   `html body #pgrid`로 구체성 자체를 올려(아이디 1개 vs 아이디+태그
   2개) 순서와 무관하게 이기게 한다. 검증은 스크린샷이 아니라
   getComputedStyle(#pgrid).gridTemplateColumns가 "174px 174px"처럼 두
   값인지로 한다(문자열 "repeat(2,1fr)"이 아니라 실제 계산된 px 두 개). */
(function(){
  var s=document.createElement('style');
  s.textContent=
    '@media (max-width:480px){'
    +'html body #pgrid{grid-template-columns:repeat(2,1fr)!important;gap:10px!important}'
    +'.pc-img{aspect-ratio:4/3!important}'
    +'.pc-body{padding:12px!important}'
    +'.pc-name{font-size:13px!important;margin:0 0 2px!important}'
    +'.pc-sci{font-size:10px!important;margin:0 0 4px!important}'
    +'.pc-fam{font-size:9px!important;padding:1px 6px!important}'
    +'}';
  document.head.appendChild(s);
})();
/* [2026-09-21 UX 진단 - 히어로/검색창/버튼 느낌] 라이브를 직접 확인해
   찾은 것들:
   1) 검색창(.psearch-input)에 outline:none만 있고 포커스 표시가 전혀
      없었다 - 키보드(Tab)로 온 사용자는 지금 커서가 검색창에 있는지
      알 방법이 없었다(접근성 문제). 감싸는 .psearchbar에 focus-within으로
      테두리를 포인트색으로 바꾼다(실제 "활성 상태"이므로 accent 사용
      원칙에 맞음, 새 색 값 안 만들고 기존 accent 재사용).
   2) 검색 버튼·필터 초기화·비교함 버튼들(비우기/비교하기/CSV 내보내기)·
      결과 CSV 내보내기 - 이 버튼들은 마우스를 올려도 반응이 없었다("더
      보기"·필터칩·비교버튼엔 이미 호버가 있었음). 새 색을 만들지 않고
      기존에 쓰이던 값만 재사용(#F2F2F2 배경 옅게, rgba(255,255,255,..)
      흰 배경 위 버튼은 투명도만 살짝 올림 - 비교 바 안의 다른 버튼들이
      이미 이 방식을 쓰고 있어 그대로 맞춤).
   **사전 검증**: 이 버튼들은 전부 Webflow 임베드 쪽 <button> 태그에
   background가 인라인 style로 박혀 있다(예: pfilterreset·pClearCompare·
   pOpenCompare·pExportCompare·pExportResults) - 인라인 스타일은
   !important 없는 외부 CSS로는 절대 못 이긴다(어제 #pgrid 사고와는
   다른 종류의 함정 - 그건 문서 순서 동점, 이건 인라인 자체가 항상
   이김). 그래서 이 다섯 개는 전부 !important를 붙였다. 반대로
   .psearch-submit(검색 버튼)과 .psearchbar(검색창 감싸개)는 인라인이
   없고 클래스로만 스타일이 걸려 있어(확인함) !important 없이도 원래
   이긴다 - 그래도 방어적으로 같이 붙여둔다. "더 보기" 버튼 호버 색
   (#1B4D3E, accent와 다른 값)은 이번엔 안 건드린다 - 버튼 자체가 인라인
   background를 갖고 있어(#fff) 임베드의 기존 :hover 규칙도 !important가
   없으면 원래도 안 먹혔을 가능성이 있고, 추정만으로 손대기보다는 실측
   없이는 보류. */
/* [2026-09-21 통합] 이 블록은 페이지 로드 시 즉시 실행돼(위 #psi 블록과
   같은 자리) 검색결과 화면(카드그리드·검색창·비교함·필터)의 스타일을
   담당한다. 원래 #pgrid .pc/.pc-cmpbtn/.pfsum-chip/#pcmpbar 등 눌림
   반응은 pEnsurePovAnimStyle()(상세창을 열 때만 실행) 안에 잘못 들어가
   있었다 - 상세창을 한 번도 안 연 첫 화면에서는 이 스타일 자체가 DOM에
   없어 카드 눌림·비교함 슬라이드가 전혀 안 먹었다(이번에 검색창 작업을
   하다가 우연히 발견해 옮김).

   [총괄+디자인 세션 조율 2026-09-21] 도감 화면 스타일을 관리하던 곳이
   plant-guide.js 말고 Webflow에 등록된 디자인 세션 스크립트 2개
   (mgpguidecolor-1.0.0.js·mgpguidemotion-1.1.0.js)에도 있어 같은
   셀렉터(#pgrid .pc:hover, .psearch-submit:hover 등)가 서로 다른 값으로
   충돌했다. 디자인 세션이 그 두 스크립트를 사이트에서 완전히 내리기로
   하고 내용을 여기 합쳐 보내줬다 - 값은 그쪽이 정한 그대로 쓰고(포인트
   그린 accent·카드 사진 확대·포커스 링), 터치 탭-고착 방지(@media
   (hover:hover))와 전환 곡선(EASE_CURVE)만 이 파일의 기존 원칙에 맞춘다.
   :hover를 그냥 붙이면 터치 기기에서 "탭한 뒤에도 눌린 색이 안 지워지는"
   문제가 생길 수 있어(터치는 진짜 호버가 없어 탭을 hover로 흉내내고,
   손을 떼도 다음 탭 전까지 그 상태가 남는 기종이 있음) 마우스 등 실제
   호버가 되는 기기에서만 먹게 감싼다 - 터치는 :active로 충분히 커버.
   포커스(:focus-within, :focus-visible)는 터치에서도 탭-포커스로 정상
   동작해야 하므로 감싸지 않는다. */
(function(){
  var s=document.createElement('style');
  s.textContent=
    '.psearchbar{transition:border-color .15s '+EASE_CURVE+'!important}'
    +'.psearchbar:focus-within{border-color:'+ACCENT+'!important;border-width:2px!important;box-shadow:0 0 0 3px rgba(11,83,69,.18)!important}' /* [2026-09-21 대표 실기기 재보고] 테두리 색만 바꾸니 1.5px 검정→진초록이 눈으로는 거의 같은 검은 선이었다(WCAG 2.4.11 포커스 대비 기준 미달, 총괄 세션이 실측) - 테두리를 2px로 살짝 굵게 하고, 바깥에 옅은 초록 링(box-shadow)을 더해 색만으로는 안 보이던 걸 "형태"로도 보이게 한다. radius 0 원칙은 그대로(box-shadow는 각진 링으로 나온다) */
    +'.picon-btn:focus-visible{box-shadow:0 0 0 3px rgba(11,83,69,.18)!important}' /* 아이콘 버튼도 같은 링 - 기존 outline:2px는 유지, 덧붙이는 것뿐이라 서로 안 부딪힘 */
    +'.psearch-submit{background:'+ACCENT+'!important;transition:background .15s '+EASE_CURVE+'!important}' /* 디자인 세션 결정 - 검색 버튼 기본색을 검정에서 포인트 그린으로 */
    +'.picon-btn{transition:background .15s '+EASE_CURVE+',border-radius .15s}'
    +'#pfilterreset{transition:background .15s '+EASE_CURVE+'}'
    +'[onclick^="pClearCompare"]{transition:background .15s '+EASE_CURVE+'}'
    +'[onclick^="pOpenCompare"]{transition:background .15s '+EASE_CURVE+'}'
    +'[onclick^="pExportCompare"]{transition:background .15s '+EASE_CURVE+'}'
    +'[onclick^="pExportResults"]{transition:background .15s '+EASE_CURVE+'}'
    +'[onclick^="pSearch"],[onclick^="pMore"],[onclick^="pCD"],[onclick^="pClearCompare"],[onclick^="pOpenCompare"],[onclick^="pCloseCompare"],[onclick^="pExportCompare"],[onclick^="pExportResults"],[onclick^="pResetFilters"],[onclick^="pToggleFilterVal"],[onclick^="pRemoveCompare"]{transition:transform .15s '+EASE_CURVE+',opacity .15s '+EASE_CURVE+'}'
    +'[onclick^="pSearch"]:active,[onclick^="pMore"]:active,[onclick^="pCD"]:active,[onclick^="pClearCompare"]:active,[onclick^="pOpenCompare"]:active,[onclick^="pCloseCompare"]:active,[onclick^="pExportCompare"]:active,[onclick^="pExportResults"]:active,[onclick^="pResetFilters"]:active,[onclick^="pToggleFilterVal"]:active,[onclick^="pRemoveCompare"]:active{transform:scale(.96);opacity:.85}'
    +'#pgrid .pc{transition:transform .15s '+EASE_CURVE+',box-shadow .15s,border-color .15s}'
    +'#pgrid .pc:active{transform:scale(.98)}'
    +'#pgrid .pc.pc-cmp-active{outline-color:'+ACCENT+'!important}'
    +'#pgrid .pc-img img{transition:transform .4s ease}' /* 디자인 세션 결정 - 카드 호버 시 사진 살짝 확대 */
    +'.pc-cmpbtn{transition:transform .15s '+EASE_CURVE+',background .15s '+EASE_CURVE+'}'
    +'.pc-cmpbtn:active{transform:scale(.94)}'
    +'.pc-cmpbtn.active{background:'+ACCENT+'!important;border-color:'+ACCENT+'!important}' /* 디자인 세션 결정 - 비교중 버튼 포인트 그린 */
    +'.fchip{transition:background .15s '+EASE_CURVE+',border-color .15s '+EASE_CURVE+',color .15s '+EASE_CURVE+'}'
    +'.fchip.active{background:'+ACCENT+'!important;border-color:'+ACCENT+'!important}' /* 디자인 세션 결정 - 선택된 필터 칩 검정→포인트 그린 */
    +'.cchip.active .cdot{box-shadow:0 0 0 2px #FAFAFA,0 0 0 3px '+ACCENT+'!important}'
    +'.cchip.active .clabel{color:'+ACCENT+'!important}'
    +'.pfsum-chip{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:'+ACCENT+';background:#fff;border:1px solid '+ACCENT+';border-radius:12px;padding:4px 8px 4px 12px;cursor:pointer;transition:transform .15s '+EASE_CURVE+',background .15s}'
    +'.pfsum-chip:active{transform:scale(.94)}'
    +'.pfsum-chip b{font-weight:400;font-size:9px;opacity:.7}'
    +'#pcmpbar{transform:translateY(100%);transition:transform .2s '+EASE_CURVE+'}' /* [UX 미세점검 C4] display:none↔flex 뚝 전환 대신 슬라이드 인/아웃 - display는 JS(renderCompareBar)가 계속 토글, 위치만 애니메이션 */
    +'#pcmpbar.pcmpbar-visible{transform:translateY(0)}'
    +'#pcmpcount{display:inline-block}'
    +'@keyframes pcmpcount-pulse{0%{transform:scale(1)}40%{transform:scale(1.4)}100%{transform:scale(1)}}'
    +'#pcmpcount.pcmpcount-pulse{animation:pcmpcount-pulse .3s ease-out}' /* 항목 추가 시 배지 펄스 */
    +'.fchip:focus-visible,.cchip:focus-visible,#pgrid .pc:focus-visible,.psearch-submit:focus-visible,.picon-btn:focus-visible{outline:2px solid '+ACCENT+';outline-offset:2px}' /* 디자인 세션 결정 - 키보드 포커스 링 */
    +'@media (hover:hover){'
    +'.psearch-submit:hover{background:#083D33!important}' /* 디자인 세션 결정 - 포인트 그린보다 더 짙게 */
    +'.picon-btn:hover{background:#F2F2F2;border-radius:50%}' /* 검색어 지우기(✕)·사진으로 찾기 아이콘 버튼 - 인라인 배경 없어 !important 불필요 */
    +'#pfilterreset:hover{background:#F2F2F2!important}'
    +'[onclick^="pClearCompare"]:hover{background:rgba(255,255,255,.1)!important}'
    +'[onclick^="pOpenCompare"]:hover{background:#F2F2F2!important}'
    +'[onclick^="pExportCompare"]:hover{background:rgba(255,255,255,.18)!important}'
    +'[onclick^="pExportResults"]:hover{background:#F2F2F2!important}'
    +'#pgrid .pc:hover{border-color:'+ACCENT+'!important;transform:translateY(-3px);box-shadow:0 12px 28px rgba(18,18,18,.12)}' /* 디자인 세션 결정 - translateY -2px→-3px, 테두리 포인트색 추가 */
    +'#pgrid .pc:hover .pc-img img{transform:scale(1.045)}'
    +'.fchip:hover{border-color:'+ACCENT+'!important}' /* 디자인 세션 결정 - 검정→포인트 그린 */
    +'#psugg .pchip:hover{border-color:'+ACCENT+'!important}'
    +'}'
    +'@media (prefers-reduced-motion:reduce){.psearchbar,.psearch-submit,.picon-btn,#pfilterreset,[onclick^="pClearCompare"],[onclick^="pOpenCompare"],[onclick^="pExportCompare"],[onclick^="pExportResults"],[onclick^="pSearch"],[onclick^="pMore"],[onclick^="pCD"],[onclick^="pResetFilters"],[onclick^="pToggleFilterVal"],[onclick^="pRemoveCompare"],#pgrid .pc,#pgrid .pc-img img,.pc-cmpbtn,.fchip,.pfsum-chip,#pcmpbar{transition:none!important}#pcmpcount.pcmpcount-pulse{animation:none!important}}';
  document.head.appendChild(s);
})();
/* [2026-09-20 고급 디자인 스킬 점검] 아이콘만 있고 글자가 없는 버튼(✕)에
   스크린리더용 이름표(aria-label)가 하나도 없었다 - 눈이 안 보이는 방문자는
   이 버튼이 뭘 하는 버튼인지 전혀 알 수 없었다. 이 버튼들은 Webflow
   임베드에 원문 그대로 박혀 있어(#psi/.pc-cmpbtn과 같은 이유로 GitHub Pages
   배포만으론 못 고침) 페이지 로드 시 한 번 속성만 덧붙인다 - 텍스트("더 보기"
   같은)가 이미 있는 버튼은 그 자체로 이름이 되니 건드리지 않는다. */
(function(){
  var head=document.querySelector('#pdhead > button');
  if(head)head.setAttribute('aria-label','상세창 닫기');
  var closeCmp=document.querySelector('[onclick="pCloseCompare()"]');
  if(closeCmp)closeCmp.setAttribute('aria-label','비교창 닫기');
})();

/* 뒤로가기 히스토리 기준점 - 이 페이지에 들어온 시점(검색어 없음)을
   replaceState로 남겨둔다. 이후 검색/상세보기마다 쌓이는 pushState들이
   결국 이 지점까지 돌아올 수 있고, 여기서 한 번 더 뒤로가기를 누르면
   그때는 브라우저가 실제로 이 페이지 진입 전 화면으로 이동한다(의도된
   동작 - 더 되돌릴 앱 내부 상태가 없으므로). */
history.replaceState({type:'search',q:'',filter:pFilterSnapshot()},'',location.href);
window.addEventListener('popstate',pOnPopState);

/* [2026-09-18] ① Enter 로도 검색되게 한다 — 검색창·버튼이 form 안에 있지 않아 Enter 가
   아무 일도 하지 않았다. 한글 조합 중(isComposing)의 Enter 는 무시한다.
   ② 기사 페이지 푸터 스크립트가 만드는 딥링크 /plant-guide?q=식물명 을 읽어 검색창에 넣고
   바로 검색한다(예전엔 검색창이 빈 채 열렸다 — 마스터 v1.5 16절 D3). */
(function bindEnterAndDeepLink(){
  var el=document.getElementById('psi');
  if(!el)return;
  el.addEventListener('keydown',function(e){
    if(e.isComposing||e.keyCode===229)return;
    if(e.key==='Enter'||e.keyCode===13){e.preventDefault();window.pSearch();}
  });
  try{
    var q=new URLSearchParams(location.search).get('q');
    if(q&&q.trim()&&!el.value.trim()){el.value=q.trim();pUpdateClearBtn();window.pSearch();}
  }catch(e){}
})();

/* 홈페이지 사진검색 배너에서 카메라로 바로 찍은 사진을 세션스토리지에
   담아 이 페이지로 넘어온 경우("배너 클릭 -> 카메라 -> 자동 이동"),
   페이지가 열리자마자 그 사진으로 바로 식별을 시작한다 - 사용자 입장에서는
   배너를 누른 것 자체가 곧 "사진으로 찾기"가 되도록 하기 위함. */
/* ---- 기사 안 "이 기사에 나온 식물" 카드 (2026-09-23 진단·구현) ----
   기사(Blog Posts) CMS의 "관련식물명"(gwanryeonsigmulmyeong) 필드에 관리자가
   쉼표로 이름을 입력하면 도감 데이터로 카드가 자동으로 만들어진다고 CMS
   필드 설명에 적혀 있었지만, 실제로는 "이 기사에 나온 식물" 제목만 뜨고 그
   아래가 항상 비어 있었다(대표 확인). 원인: 기사 템플릿(HtmlEmbed, 디자인
   쪽 담당)엔 #plant-names-source(원문 텍스트, 정적 렌더)와 빈 #tge-plant-cards
   그릇, 그리고 그 그릇의 표시를 토글하는 초기화 스크립트까지는 이미 있었는데,
   이름을 실제 종으로 바꿔 카드를 "그리는" 코드 자체가 어디에도 없었다 - 이
   세션이 만드는 게 자연스러운 부분(도감 검색·사진 로딩 함수를 그대로 재사용)
   인데 빠져 있었던 것.
   기사 페이지엔 검색창(#psi)이 없어 파일 위쪽 PG_PAGE 가드에 걸리지만, 여기서
   쓰는 함수(fetchSourceItemsWithVariant·toObj·loadCardImage·sciNameHtml)는
   정적 전체 데이터셋 프리로딩과 무관하게 항상 정의돼 있어 그대로 쓸 수 있다.
   이름 하나당 도감 검색(plantPilbkSearch) 1회만 부르고(전형적으로 기사 하나에
   1~3개), 정확히 같은 국명으로 매칭되는 항목을 우선 채택한다 - "정확한 데이터만
   신뢰" 원칙과 같게, 매칭되는 종이 없는 이름은 오류로 보여주지 않고 조용히
   뺀다(편집자 오탈자·희귀종 등은 독자에게 빈 카드보다 그냥 없는 편이 낫다).
   카드 클릭 시 페이지 이동 없이 그 자리에 경량 상세 시트가 열린다(대표 지시
   2026-09-23 "카드를 클릭하면 카드가 나와야지, 도감 페이지로 이동하면 안
   됨" - 시트 안의 "도감에서 더 보기"만 /plant-guide?q=<이름>으로 이어진다,
   이미 있는 자동검색 딥링크·bindEnterAndDeepLink 참고). href 자체는 그대로
   남겨둬 중클릭/새 탭 등은 여전히 도감 검색으로 정상 동작한다. */
(function(){
  var wrap=document.getElementById('tge-plant-cards');
  if(!wrap)return; /* 이 위젯이 없는 페이지(도감 자체 등)에서는 아무 일도 하지 않는다 */
  var srcEl=document.getElementById('plant-names-source');
  var heading=document.getElementById('plants-mentioned-heading');
  var guideBase=wrap.getAttribute('data-guide')||'/plant-guide';
  function pickBest(items,name){
    for(var i=0;i<items.length;i++)if(items[i].nm===name)return items[i];
    return items[0]||null;
  }
  function cardEl(it){
    var a=document.createElement('a');
    a.className='tge-pcard';
    a.href=guideBase+'?q='+encodeURIComponent(it.nm);
    a.innerHTML='<span class="tge-pcard-img">'+PLACEHOLDER_ICON+'</span>'
      +'<span class="tge-pcard-txt"><span class="tge-pcard-nm"></span>'
      +(it.sc?'<span class="tge-pcard-sc">'+sciNameHtml(it.sc)+'</span>':'')
      +'</span>';
    a.querySelector('.tge-pcard-nm').textContent=it.nm; /* esc() 대신 textContent로 안전하게 채운다 */
    /* [대표 지시 2026-09-23] "카드를 클릭하면 카드가 나와야지, 도감 페이지로
       이동하면 안 됨" - 페이지 이동 대신 그 자리에 경량 상세 시트를 연다.
       href는 그대로 남겨 중클릭/Ctrl+클릭(새 탭)·우클릭·JS 실패 시 폴백은
       기존대로 도감 검색으로 동작한다(점진적 향상). */
    a.addEventListener('click',function(e){
      if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
      e.preventDefault();
      openSheet(it,a);
    });
    return a;
  }
  function injectStyleOnce(){
    if(document.getElementById('tge-pcards-style'))return;
    var s=document.createElement('style');
    s.id='tge-pcards-style';
    s.textContent=
      '.tge-pcards{display:flex;flex-wrap:wrap;gap:10px;margin:0;padding:0;list-style:none}'
      +'.tge-pcard{display:flex;align-items:center;gap:10px;padding:8px;border:1px solid #E6E6E6;background:#fff;text-decoration:none;flex:1 1 220px;max-width:280px;transition:border-color .15s '+EASE_CURVE+',transform .15s '+EASE_CURVE+';cursor:pointer}'
      +'.tge-pcard-img{width:44px;height:44px;flex:0 0 44px;display:flex;align-items:center;justify-content:center;background:#F2F2F2;overflow:hidden}'
      +'.tge-pcard-img img{width:100%;height:100%;object-fit:cover;display:block}'
      +'.tge-pcard-txt{display:flex;flex-direction:column;gap:2px;min-width:0}'
      +'.tge-pcard-nm{font-size:13px;line-height:1.3;color:#121212;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
      +'.tge-pcard-sc{font-size:11px;line-height:1.3;color:#6E6E6E;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
      +'.tge-pcard:active{transform:scale(.98)}'
      +'.tge-pcard:focus-visible{outline:2px solid '+ACCENT+';outline-offset:2px}'
      +'@media (hover:hover){.tge-pcard:hover{border-color:'+ACCENT+'}}'
      +'@media (prefers-reduced-motion:reduce){.tge-pcard{transition:none!important}}'
      /* ---- 경량 상세 시트: 데스크톱 중앙 모달, ≤640px 전체화면 바텀시트
         (09-19 팝업 UX 진단서 기준 - 상세창 pDetail과 같은 열림 방식:
         데스크톱 페이드업/모바일 바텀시트, 컴팩트 헤더 56px·닫기 44px) ---- */
      +'.tge-sheet-backdrop{position:fixed;inset:0;background:rgba(18,18,18,.5);z-index:9998;opacity:0;transition:opacity .25s '+EASE_CURVE+'}'
      +'.tge-sheet-backdrop.tge-sheet-open{opacity:1}'
      +'.tge-sheet{position:fixed;left:50%;top:50%;transform:translate(-50%,-46%);width:min(520px,calc(100vw - 32px));max-height:85vh;background:#fff;z-index:9999;display:flex;flex-direction:column;opacity:0;transition:opacity .25s '+EASE_CURVE+',transform .25s '+EASE_CURVE+';box-shadow:0 24px 64px rgba(18,18,18,.28)}'
      +'.tge-sheet.tge-sheet-open{opacity:1;transform:translate(-50%,-50%)}'
      +'.tge-sheet-head{flex:0 0 auto;display:flex;align-items:center;gap:12px;padding:0 8px 0 20px;height:56px;border-bottom:1px solid #E6E6E6}'
      +'.tge-sheet-head-nm{flex:1;min-width:0;font-size:15px;font-weight:600;color:#121212;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
      +'.tge-sheet-close{flex:0 0 44px;width:44px;height:44px;display:flex;align-items:center;justify-content:center;border:none;background:transparent;cursor:pointer;color:#6E6E6E;font-size:20px;line-height:1}'
      +'.tge-sheet-close:focus-visible{outline:2px solid '+ACCENT+';outline-offset:-2px}'
      +'@media (hover:hover){.tge-sheet-close:hover{background:#F2F2F2}}'
      +'.tge-sheet-body{flex:1 1 auto;overflow-y:auto;padding:20px}'
      +'.tge-sheet-img{width:100%;aspect-ratio:4/3;background:#F2F2F2;margin-bottom:16px;display:flex;align-items:center;justify-content:center;overflow:hidden}'
      +'.tge-sheet-sc{font-size:13px;color:#6E6E6E;margin:2px 0 6px}'
      +'.tge-sheet-fam{display:inline-block;font-size:11px;color:'+ACCENT+';border:1px solid '+ACCENT+';padding:2px 8px;margin-bottom:16px}'
      +'.tge-sheet-more{display:block;text-align:center;font-size:13px;font-weight:600;color:#fff;background:'+ACCENT+';padding:13px;text-decoration:none;margin-top:4px}'
      +'@media (hover:hover){.tge-sheet-more:hover{background:#083D33}}'
      +'body.tge-sheet-locked{position:fixed;left:0;right:0;width:100%}'
      +'@media (max-width:640px){'
      +'.tge-sheet{left:0;top:auto;bottom:0;right:0;width:100%;max-width:none;max-height:100vh;height:100%;transform:translateY(100%)}'
      +'.tge-sheet.tge-sheet-open{transform:translateY(0)}'
      +'.tge-sheet-img{aspect-ratio:1/1}'
      +'}'
      +'@media (prefers-reduced-motion:reduce){.tge-sheet,.tge-sheet-backdrop{transition:none!important}}';
    document.head.appendChild(s);
  }
  /* ---- 경량 상세 시트 본체 ----
     기존 pDetail()의 상세창은 #pdpanel·#pdimg·#pdbody 등 도감 페이지(Webflow
     HtmlEmbed, 디자인 쪽 담당)에만 있는 수십 개 고정 요소에 강하게 의존해
     기사 페이지에 그대로 옮길 수 없다(그 마크업을 기사 템플릿에도 복제하면
     이번 세션에 실제로 겪은 것과 같은 종류의 dual-ownership 충돌 위험이
     생긴다). 그 대신 이 함수가 처음 열릴 때 DOM을 직접 만들어 완전히
     독립적으로 동작한다 - 사진 슬라이드·핵심 정보 요약은 도감과 같은
     데이터 함수(fetchAllPhotos·deriveCuratedProfile·pdSummaryHtml)를
     재사용하되, 탭·비교 등은 넣지 않은 경량판이다(대표 승인 범위:
     "사진·국명·학명·과명·핵심 3~4줄 + 도감에서 더 보기"). */
  var sheetEl=null,backdropEl=null,sheetScrollY=0,sheetOpenToken=0,sheetReturnFocus=null;
  function ensureSheet(){
    if(sheetEl)return;
    backdropEl=document.createElement('div');
    backdropEl.className='tge-sheet-backdrop';
    backdropEl.addEventListener('click',closeSheet);
    sheetEl=document.createElement('div');
    sheetEl.className='tge-sheet';
    sheetEl.setAttribute('role','dialog');
    sheetEl.setAttribute('aria-modal','true');
    sheetEl.innerHTML='<div class="tge-sheet-head"><span class="tge-sheet-head-nm"></span>'
      +'<button type="button" class="tge-sheet-close" aria-label="닫기">&#10005;</button></div>'
      +'<div class="tge-sheet-body"><div class="tge-sheet-img"></div>'
      +'<div class="tge-sheet-nm" style="font-size:18px;font-weight:700;color:#121212"></div>'
      +'<div class="tge-sheet-sc"></div><div class="tge-sheet-fam-wrap"></div>'
      +'<div class="tge-sheet-summary"></div>'
      +'<a class="tge-sheet-more" target="_self">도감에서 더 보기 →</a></div>';
    sheetEl.querySelector('.tge-sheet-close').addEventListener('click',closeSheet);
    document.body.appendChild(backdropEl);
    document.body.appendChild(sheetEl);
    document.addEventListener('keydown',function(e){
      if(e.key==='Escape'&&sheetEl.classList.contains('tge-sheet-open'))closeSheet();
    });
  }
  function openSheet(it,triggerEl){
    injectStyleOnce();
    ensureSheet();
    var myToken=++sheetOpenToken;
    sheetReturnFocus=triggerEl||null;
    sheetEl.querySelector('.tge-sheet-head-nm').textContent=it.nm;
    sheetEl.querySelector('.tge-sheet-nm').textContent=it.nm;
    var scEl=sheetEl.querySelector('.tge-sheet-sc');
    scEl.innerHTML=it.sc?sciNameHtml(it.sc):'';
    sheetEl.querySelector('.tge-sheet-fam-wrap').innerHTML=it.fam?'<span class="tge-sheet-fam">'+esc(it.fam)+'</span>':'';
    var imgWrap=sheetEl.querySelector('.tge-sheet-img');
    imgWrap.innerHTML=PLACEHOLDER_ICON;
    sheetEl.querySelector('.tge-sheet-summary').innerHTML='';
    var moreLink=sheetEl.querySelector('.tge-sheet-more');
    moreLink.href=guideBase+'?q='+encodeURIComponent(it.nm);
    sheetScrollY=window.scrollY||document.documentElement.scrollTop||0;
    document.body.classList.add('tge-sheet-locked');
    document.body.style.top='-'+sheetScrollY+'px';
    backdropEl.style.display='block';
    sheetEl.style.display='flex';
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){
        backdropEl.classList.add('tge-sheet-open');
        sheetEl.classList.add('tge-sheet-open');
      });
    });
    sheetEl.querySelector('.tge-sheet-close').focus();
    fetchAllPhotos(it.nm,it.sc,function(photos){
      if(myToken!==sheetOpenToken)return;
      if(photos.length)renderImageSlider(imgWrap,null,photos);
    });
    if(it.no){
      Promise.all([fetchPilbkItem(it.no),staticDataReady,bookSummaryFields(it.sc)]).then(function(res){
        if(myToken!==sheetOpenToken)return;
        var item=res[0],bk=res[2]||{};
        var match=getStaticMatch(it.sc);
        var profile=item?deriveCuratedProfile(item,match,it.sc):null;
        sheetEl.querySelector('.tge-sheet-summary').innerHTML=pdSummaryHtml({
          sunlight:profile&&profile.sunlight,
          moisture:profile&&profile.moisture,
          height:bk.height,
          bloom:bk.bloom
        });
      }).catch(function(){});
    }
  }
  function closeSheet(){
    sheetOpenToken++; /* 진행 중이던 사진·정보 로딩 응답을 무시시킨다 */
    backdropEl.classList.remove('tge-sheet-open');
    sheetEl.classList.remove('tge-sheet-open');
    document.body.classList.remove('tge-sheet-locked');
    document.body.style.top='';
    window.scrollTo(0,sheetScrollY);
    setTimeout(function(){backdropEl.style.display='none';sheetEl.style.display='none';},260);
    if(sheetReturnFocus&&sheetReturnFocus.focus)sheetReturnFocus.focus();
  }
  function hide(){wrap.style.display='none';if(heading)heading.style.display='none';}
  function render(){
    var raw=(srcEl?srcEl.textContent:wrap.getAttribute('data-plants'))||'';
    var names=raw.split(/[,，、]/).map(function(s){return s.trim();}).filter(Boolean).slice(0,6);
    if(!names.length){hide();return;}
    injectStyleOnce();
    wrap.innerHTML='';
    wrap.classList.add('tge-pcards');
    var pending=names.length,shown=0;
    names.forEach(function(name){
      fetchSourceItemsWithVariant('/plantPilbkSearch',name).then(function(rawItems){
        return Array.isArray(rawItems)?rawItems.map(function(r){return toObj(r,'gov');}):[];
      }).catch(function(){return [];}).then(function(items){
        var best=pickBest(items,name);
        pending--;
        if(best){
          shown++;
          var el=cardEl(best);
          wrap.appendChild(el);
          loadCardImage(best.nm,best.sc,el.querySelector('.tge-pcard-img'),null,true);
        }
        if(pending===0){
          if(shown)wrap.style.display='flex';
          else hide();
        }
      });
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render);
  else render();
})();

(function autoPhotoFromHome(){
  try{
    if(!/[?&]autoPhoto=1(&|$)/.test(location.search))return;
    var raw=sessionStorage.getItem('pgPendingPhoto');
    var cleanUrl=location.pathname+location.search.replace(/[?&]autoPhoto=1/,'').replace(/^&/,'?')+location.hash;
    history.replaceState(history.state,'',cleanUrl);
    if(!raw)return;
    sessionStorage.removeItem('pgPendingPhoto');
    var items=JSON.parse(raw);
    Promise.all(items.map(function(it){
      return fetch(it.dataUrl).then(function(r){return r.blob();}).then(function(blob){
        return new File([blob],it.name||'photo.jpg',{type:it.type||'image/jpeg'});
      });
    })).then(function(files){
      if(files.length)pIdentifyPhoto(files);
    });
  }catch(e){}
})();
})();