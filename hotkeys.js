/* ArenaSector keyboard shortcuts: one dispatcher, layout-independent physical key codes. */
(() => {
  'use strict';
  const el=id=>document.getElementById(id);
  if(!el('hotkeysDialog')||!window.ArenaUX)return;

  const ux=()=>window.ArenaUX, studio=()=>window.ArenaStudio;
  const frame=()=>document.querySelector('#editView .studio-stage');
  const activeEditor=()=>mode==='edit';
  const currentTool=()=>ux()?.getTool()||'select';
  const isEditable=target=>{
    const node=target||document.activeElement;
    return !!node&&(node.isContentEditable||node.closest?.('[contenteditable="true"]')||
      ['INPUT','SELECT','TEXTAREA'].includes(node.tagName));
  };
  const dialogs=()=>[...document.querySelectorAll('dialog[open]')];
  const topDialog=()=>dialogs().at(-1)||null;
  let clip=null,keysOpen=false;
  const HELP=[
    {group:'Общие',items:[
      ['? или Ctrl+/', 'Показать список горячих клавиш'],
      ['Ctrl+Z','Отменить изменение схемы'],
      ['Ctrl+Y / Ctrl+Shift+Z','Повторить отменённое действие'],
      ['Ctrl+S','Скачать JSON-копию проекта'],
      ['Ctrl+Shift+S','Сохранить версию на устройстве'],
      ['Ctrl+O','Импортировать проект JSON'],
      ['Ctrl+Shift+E','Экспорт PNG с проверкой схемы'],
      ['Alt+1 / 2 / 3 / 4','Карта / Редактор / Просмотр / Отчёты'],
      ['Esc','Закрыть окно, отменить установку лестницы или снять выделение']
    ]},
    {group:'Инструменты и схема',items:[
      ['1 / V','Выбрать кресло'],
      ['2 / M','Двигать кресла'],
      ['3 / H','Рука: перемещать схему'],
      ['4 / R','Выбирать один или несколько рядов'],
      ['5 / L','Ставить и передвигать лестницы'],
      ['Пробел + перетаскивание','Временно перемещать схему'],
      ['Колесо мыши','Приблизить или отдалить схему'],
      ['+ / −','Увеличить / уменьшить масштаб'],
      ['0','Показать весь сектор'],
      ['9','Вернуться к рабочему масштабу']
    ]},
    {group:'Выбор и перемещение',items:[
      ['Стрелки','Выбрать соседнее место или ряд'],
      ['Стрелки в режиме «Двигать»','Сдвинуть кресло или ряд на 16 единиц'],
      ['Shift+стрелки в «Двигать»','Сдвинуть на 64 единицы'],
      ['Shift+стрелки в «Ряды»','Сдвинуть выделенные ряды'],
      ['←/→ в «Лестница»','Сдвинуть выбранную лестницу на 4 единицы'],
      ['Shift+←/→ в «Лестница»','Сдвинуть лестницу на 16 единиц'],
      ['PgUp / PgDn','Предыдущий / следующий ряд'],
      ['[ / ]','Предыдущее / следующее кресло'],
      ['Home / End','Первое / последнее место или ряд'],
      ['F2 / Enter','Изменить номер выбранного места или ряда'],
      ['F / /','Быстрый поиск ряда или места']
    ]},
    {group:'Создание и редактирование',items:[
      ['N','Добавить кресло в выбранный ряд'],
      ['Shift+N','Открыть добавление ряда'],
      ['B','Создать несколько рядов по шаблону'],
      ['Shift+D','Дублировать выбранное кресло или ряд'],
      ['Delete / Backspace','Удалить выбранное место или ряд с подтверждением'],
      ['G','Добавить промежуток после места'],
      ['Shift+G','Уменьшить промежуток после места'],
      ['Shift+L','Поставить лестницу после выбранного места'],
      ['Shift+R','Перевернуть нумерацию ряда'],
      ['K','Заблокировать / разблокировать ряд'],
      ['E','Открыть настройки сектора'],
      ['I','Открыть окно выбранного кресла'],
      ['C','Проверить схему на ошибки'],
      ['P','Открыть просмотр сектора']
    ]},
    {group:'Копирование и группы',items:[
      ['Ctrl+C','Скопировать выбранное кресло или ряды внутри редактора'],
      ['Ctrl+V','Вставить скопированное в текущий сектор'],
      ['Ctrl+A в «Ряды»','Выделить все ряды сектора'],
      ['Ctrl+M','Объединить выделенные соседние места']
    ]}
  ];

  function renderHelp(query=''){
    const term=query.trim().toLocaleLowerCase('ru-RU');
    const out=[];
    for(const entry of HELP){
      const list=entry.items.filter(([key,description])=>
        !term||(key+' '+description+' '+entry.group).toLocaleLowerCase('ru-RU').includes(term));
      if(!list.length)continue;
      out.push('<section class="hotkey-category"><h3>'+entry.group+'</h3>');
      out.push('<div class="hotkey-rows">');
      for(const [shortcut,description] of list){
        const names=shortcut.split(' / ');
        out.push('<div class="hotkey-row"><div class="hotkey-keys">'+names.map(name=>
          '<kbd>'+name+'</kbd>').join('<span class="hotkey-or">/</span>')+'</div>'+
          '<div class="hotkey-desc">'+description+'</div></div>');
      }
      out.push('</div></section>');
    }
    el('hotkeysList').innerHTML=out.join('')||'<div class="ux-modal-empty">Совпадений не найдено.</div>';
  }
  function openHelp(){
    if(topDialog()&&topDialog()!==el('hotkeysDialog'))return;
    if(!el('hotkeysDialog').open)el('hotkeysDialog').showModal();
    keysOpen=true;
    el('hotkeysSearch').value='';
    renderHelp();
    el('hotkeysSearch').focus();
  }
  function closeHelp(){if(el('hotkeysDialog').open)el('hotkeysDialog').close();keysOpen=false;}
  el('hotkeysHelpButton').addEventListener('click',openHelp);
  el('hotkeysDialogClose').addEventListener('click',closeHelp);
  el('hotkeysDialogDone').addEventListener('click',closeHelp);
  el('hotkeysSearch').addEventListener('input',e=>renderHelp(e.target.value));
  el('hotkeysDialog').addEventListener('close',()=>{keysOpen=false;});
  el('hotkeysDialog').addEventListener('click',e=>{if(e.target===el('hotkeysDialog'))closeHelp();});

  // Fast seat/row finder. Does not require opening a full-screen dialog or scrolling the list.
  const finder=document.createElement('dialog');
  finder.id='hotkeysFinder';
  finder.className='studio-dialog hotkeys-finder';
  finder.setAttribute('aria-labelledby','hotkeysFinderTitle');
  finder.innerHTML='<div class="studio-modal-head"><div><h2 id="hotkeysFinderTitle">Найти место или ряд</h2>'+
    '<span>Поиск в выбранном секторе</span></div><button class="studio-close" id="hotkeysFinderClose" type="button" aria-label="Закрыть">✕</button></div>'+
    '<div class="hotkeys-search-row"><input class="field" id="hotkeysFindInput" type="search" placeholder="Номер ряда или места…" autocomplete="off" aria-label="Номер ряда или места"></div>'+
    '<div class="ux-modal-body hotkeys-find-results" id="hotkeysFindResults"></div>';
  document.body.append(finder);
  const findInput=finder.querySelector('#hotkeysFindInput'),findResults=finder.querySelector('#hotkeysFindResults');
  let found=[];
  function closeFinder(){if(finder.open)finder.close();}
  function searchItems(){
    const q=findInput.value.trim().toLocaleLowerCase('ru-RU');
    const rows=getSector().rows;
    const results=[];
    if(q){
      for(const row of rows){
        if(row.label.toLocaleLowerCase('ru-RU').includes(q))
          results.push({row:row.id,seat:null,title:'Ряд '+row.label,desc:row.seats.length+' мест'});
        for(const seat of row.seats){
          if(seat.number.toLocaleLowerCase('ru-RU').includes(q))
            results.push({row:row.id,seat:seat.id,title:'Место '+seat.number,desc:'Ряд '+row.label});
        }
        if(results.length>=60)break;
      }
    }
    found=results.slice(0,60);
    findResults.innerHTML=found.length?found.map((item,i)=>
      '<button type="button" class="hotkeys-find-item" data-hotkeys-found="'+i+'"><strong>'+safeText(item.title)+
      '</strong><span>'+safeText(item.desc)+'</span></button>').join('')
      :'<div class="ux-modal-empty">'+(q?'Ничего не найдено':'Начни вводить номер места или ряда')+'</div>';
  }
  function scrollToSelection(){
    requestAnimationFrame(()=>{
      const canvas=el('editCanvas'),container=frame();
      if(!canvas||!container)return;
      const seat=selectedSeat&&[...canvas.querySelectorAll('[data-seat]')].find(n=>n.dataset.seat===selectedSeat);
      if(seat?.getBoundingClientRect){
        const r=seat.getBoundingClientRect(),outer=container.getBoundingClientRect();
        if(r.left<outer.left+35||r.right>outer.right-35)
          container.scrollLeft+=(r.left+r.right-outer.left-outer.right)/2;
        if(r.top<outer.top+35||r.bottom>outer.bottom-35)
          container.scrollTop+=(r.top+r.bottom-outer.top-outer.bottom)/2;
      }else if(selectedRow)ux()?.focusRow?.(selectedRow);
    });
  }
  function selectRow(row,seat=null){
    if(!row)return;
    selectedRow=row.id;selectedSeat=seat?.id||null;
    multiSelectedSeatIds.clear();
    renderRowSelectionOnly();
    renderSeatEditor();
    ux()?.setSelectedRows?.(ux()?.getTool()==='row'?[row.id]:[]);
    scrollToSelection();
  }
  function selectFound(i){
    const item=found[i];
    if(!item)return;
    const row=getSector().rows.find(r=>r.id===item.row);
    if(!row)return;
    if(ux()?.getTool()==='row'&&item.seat)ux()?.setTool?.('select');
    selectRow(row,item.seat?row.seats.find(s=>s.id===item.seat):null);
    closeFinder();
  }
  function openFinder(){
    if(!activeEditor()||topDialog())return;
    findInput.value='';searchItems();
    finder.showModal();findInput.focus();
  }
  findInput.addEventListener('input',searchItems);
  findInput.addEventListener('keydown',e=>{
    if(e.key==='Enter'&&found.length){e.preventDefault();selectFound(0);}
  });
  findResults.addEventListener('click',e=>{
    const button=e.target.closest('[data-hotkeys-found]');
    if(button)selectFound(Number(button.dataset.hotkeysFound));
  });
  finder.querySelector('#hotkeysFinderClose').addEventListener('click',closeFinder);
  finder.addEventListener('click',e=>{if(e.target===finder)closeFinder();});

  function focusNumber(){
    const inspector=el('uxInspector');
    inspector?.classList.remove('is-hidden');
    if(window.innerWidth<=710)inspector?.classList.add('is-open');
    const numberField=selectedSeat?el('uxSeatNumber'):el('uxRowNumber');
    if(numberField){numberField.focus();numberField.select?.();return true;}
    return false;
  }
  function navigateSeat(step){
    let row=getRow(),rows=getSector().rows;
    if(!row&&rows.length){row=rows[0];selectedRow=row.id;}
    if(!row?.seats.length)return false;
    const ordered=rowStairLayout(row,getSector()).ordered;
    let index=ordered.findIndex(s=>s.id===selectedSeat);
    if(index<0)index=step>0?-1:ordered.length;
    const next=ordered[Math.max(0,Math.min(ordered.length-1,index+step))];
    if(!next)return false;
    selectRow(row,next);return true;
  }
  function navigateRow(step,keepSeat=false){
    const rows=getSector().rows;
    if(!rows.length)return false;
    const current=rows.findIndex(r=>r.id===selectedRow);
    let i=Math.max(0,Math.min(rows.length-1,(current<0?0:current)+step));
    while(i>=0&&i<rows.length&&!rows[i].seats.length&&keepSeat)i+=step>0?1:-1;
    if(i<0||i>=rows.length)return false;
    const row=rows[i];
    let nextSeat=null;
    if(keepSeat&&row.seats.length){
      const old=getSeat(),oldX=old?.x??0;
      nextSeat=row.seats.reduce((best,s)=>!best||Math.abs(s.x-oldX)<Math.abs(best.x-oldX)?s:best,null);
    }
    selectRow(row,nextSeat);return true;
  }
  function goEdge(end){
    if(ux()?.getTool()==='row'){
      const rows=getSector().rows;
      if(rows.length){selectRow(end?rows.at(-1):rows[0]);return true;}
      return false;
    }
    const row=getRow();
    if(!row?.seats.length)return false;
    const ordered=rowStairLayout(row,getSector()).ordered;
    selectRow(row,end?ordered.at(-1):ordered[0]);return true;
  }
  function moveRows(dx,dy,multi=false){
    const rows=getSector().rows;
    const ids=multi?ux()?.getSelectedRowIds?.():[selectedRow];
    const selected=(ids||[]).map(id=>rows.find(r=>r.id===id)).filter(Boolean);
    if(!selected.length)return false;
    if(selected.some(r=>r.locked)){toast('Сначала разблокируй выбранные ряды');return false;}
    for(const row of selected)for(const seat of row.seats){seat.x+=dx;seat.y+=dy;}
    changed();return true;
  }
  const DELTAS={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
  function handleArrows(e){
    const dir=DELTAS[e.key];if(!dir)return false;
    const tool=ux()?.getTool();
    if(tool==='pan'){
      const container=frame();if(!container)return false;
      const size=e.shiftKey?240:80;
      container.scrollLeft+=dir[0]*size;container.scrollTop+=dir[1]*size;
      return true;
    }
    if(tool==='stair'){
      if(!dir[0]){
        if(frame())frame().scrollTop+=dir[1]*80;
        return true; // Never let the legacy handler move a row in staircase mode.
      }
      const ok=ux()?.nudgeSelectedStair?.(dir[0]*(e.shiftKey?16:4));
      if(!ok)toast('Сначала выбери лестницу на схеме');
      return true;
    }
    if(tool==='row'){
      if(e.shiftKey)return moveRows(dir[0]*64,dir[1]*64,true);
      if(dir[1])return navigateRow(-dir[1]);
      if(frame())frame().scrollLeft+=dir[0]*80;
      return true; // Row-selection mode must never move row coordinates accidentally.
    }
    if(tool==='move'){
      const row=getRow(),seat=getSeat(),scale=e.shiftKey?64:16;
      if(studio()?.getTarget()==='row'||!seat)return moveRows(dir[0]*scale,dir[1]*scale);
      if(!row||row.locked){toast('Ряд заблокирован');return true;}
      seat.x+=dir[0]*scale;seat.y+=dir[1]*scale;changed();return true;
    }
    if(dir[0])return navigateSeat(dir[0]);
    return navigateRow(-dir[1],!!getSeat());
  }
  function toggleLock(){
    const row=getRow();if(!row)return false;
    row.locked=!row.locked;changed();return true;
  }
  function duplicate(){
    const row=getRow(),seat=getSeat();
    if(!row)return false;
    if((ux()?.getTool()==='select'||ux()?.getTool()==='move')&&seat)
      return copySelection()&&pasteSelection();
    if(getSector().rows.length>=300){toast('В секторе не может быть больше 300 рядов');return false;}
    const clone=structuredClone(row);
    clone.id=uid();clone.locked=false;clone.label=nextRowLabel();
    clone.seats.forEach(s=>s.id=uid());
    const i=getSector().rows.indexOf(row);
    getSector().rows.splice(i+1,0,clone);
    selectedRow=clone.id;selectedSeat=null;changed();return true;
  }
  function copySelection(){
    if(!activeEditor())return false;
    const row=getRow(),seat=getSeat(),tool=ux()?.getTool();
    if(seat&&tool!=='row'){
      clip={kind:'seat',seats:[structuredClone(seat)]};
      toast('Кресло скопировано');return true;
    }
    const ids=tool==='row'?ux()?.getSelectedRowIds?.()||[]:[];
    const rows=ids.length?ids.map(id=>getSector().rows.find(r=>r.id===id)).filter(Boolean):row?[row]:[];
    if(!rows.length)return false;
    clip={kind:'rows',rows:rows.map(r=>structuredClone(r))};
    toast(rows.length>1?'Скопировано рядов: '+rows.length:'Ряд скопирован');return true;
  }
  function pasteSelection(){
    if(!activeEditor()||!clip)return false;
    if(clip.kind==='seat'){
      const row=getRow();if(!row||row.locked||row.seats.length>=500){
        toast('Выбери незаблокированный ряд с доступными местами');return true;
      }
      const src=clip.seats[0],added=structuredClone(src);
      added.id=uid();
      const numeric=row.seats.map(s=>Number(s.number)).filter(Number.isInteger);
      let number=String(numeric.length?Math.max(...numeric)+1:row.seats.length+1);
      while(row.seats.some(s=>s.number===number))number+='a';
      added.number=number;
      const max=Math.max(0,...row.seats.map(s=>s.x+seatWidth(s)));
      added.x=max+6;added.y=row.seats.at(-1)?.y??0;
      row.seats.push(added);selectedSeat=added.id;changed();return true;
    }
    if(clip.kind==='rows'){
      const sector=getSector();
      if(sector.rows.length+clip.rows.length>300){toast('Лимит: 300 рядов');return true;}
      for(const original of clip.rows){
        const row=structuredClone(original);
        row.id=uid();row.label=nextRowLabel();row.locked=false;
        row.seats.forEach(s=>s.id=uid());
        sector.rows.push(row);selectedRow=row.id;
      }
      selectedSeat=null;changed();return true;
    }
    return false;
  }
  function removeSelected(){
    const row=getRow(),seat=getSeat(),tool=ux()?.getTool();
    if(tool==='row'){
      const ids=ux()?.getSelectedRowIds?.()||[selectedRow];
      const targets=getSector().rows.filter(r=>ids.includes(r.id)&&!r.locked);
      if(!targets.length)return false;
      if(!confirm('Удалить '+targets.length+' рядов и все их места?'))return true;
      const removed=new Set(targets.map(r=>r.id));
      getSector().rows=getSector().rows.filter(r=>!removed.has(r.id));
      selectedRow=getSector().rows[0]?.id||null;selectedSeat=null;
      ux()?.setSelectedRows?.([]);
      changed();return true;
    }
    if(seat&&row&&!row.locked){
      if(!confirm('Удалить место '+seat.number+' из ряда '+row.label+'?'))return true;
      row.seats=row.seats.filter(s=>s.id!==seat.id);
      selectedSeat=null;changed();return true;
    }
    if(row&&!row.locked){
      if(!confirm('Удалить ряд '+row.label+' со всеми местами?'))return true;
      getSector().rows=getSector().rows.filter(r=>r.id!==row.id);
      selectedRow=getSector().rows[0]?.id||null;selectedSeat=null;changed();return true;
    }
    if(row?.locked)toast('Сначала разблокируй ряд');
    return !!row;
  }
  function focusMode(modeName){
    if(!activeEditor())return false;
    ux()?.setTool?.(modeName);
    return true;
  }
  function showBatch(){
    if(!activeEditor())return false;
    if(!el('studioRowsDialog').open)el('studioOpenRows').click();
    el('uxBatchOpen').click();return true;
  }
  function showSeat(){
    if(!getSeat())return false;
    el('studioOpenSeat').click();return true;
  }
  function zoomScale(factor){
    if(!activeEditor())return false;
    studio()?.zoomTo?.(Math.max(.35,Math.min(2.5,zoom.edit*factor)));
    return true;
  }
  function activeDialogInput(){
    const top=topDialog();return top?.contains(document.activeElement);
  }
  function stop(e){e.preventDefault();e.stopImmediatePropagation?.();}
  function handle(e){
    if(e.defaultPrevented)return false;
    if(e.isComposing||e.key==='Process'||e.keyCode===229)return false;
    const code=e.code||e.key;
    const ctrl=!!(e.ctrlKey||e.metaKey),alt=!!e.altKey,shift=!!e.shiftKey;
    const editing=isEditable(e.target)||isEditable(document.activeElement);
    const modal=topDialog();
    const helpKey=!ctrl&&!alt&&(e.key==='?'||(shift&&code==='Slash'));
    const ctrlHelp=ctrl&&!alt&&code==='Slash';
    if((helpKey||ctrlHelp)&&!editing){
      if(!modal||modal===el('hotkeysDialog')){stop(e);openHelp();return true;}
    }
    if(code==='Escape'){
      if(modal){stop(e);if(modal===el('hotkeysDialog'))closeHelp();else modal.close();return true;}
      if(editing&&document.activeElement?.blur){document.activeElement.blur();return false;}
      if(activeEditor()){
        stop(e);studio()?.cancelStair?.();ux()?.clearSelection?.();ux()?.setTool?.('select');return true;
      }
      return false;
    }
    if(editing)return false; // Native text editing, including Ctrl+Z, remains intact in inputs.
    if(ctrl&&!alt){
      let fn=null;
      if(code==='KeyZ'){fn=()=>shift?ux()?.redo?.():ux()?.undo?.();}
      else if(code==='KeyY'&&!shift)fn=()=>ux()?.redo?.();
      else if(code==='KeyS'&&shift)fn=()=>ux()?.saveVersion?.().catch(err=>toast(err.message));
      else if(code==='KeyS')fn=()=>doExport();
      else if(code==='KeyO')fn=()=>el('importBtn').click();
      else if(code==='KeyE'&&shift)fn=()=>el('exportPngBtn').click();
      else if(code==='KeyC'&&activeEditor()&&getRow())fn=copySelection;
      else if(code==='KeyV'&&activeEditor()&&clip)fn=pasteSelection;
      else if(code==='KeyA'&&activeEditor()&&ux()?.getTool()==='row')
        fn=()=>ux()?.setSelectedRows?.(getSector().rows.map(r=>r.id));
      else if(code==='KeyM'&&activeEditor()&&multiSelectEnabled)
        fn=()=>mergeSelectedSeats();
      if(fn){stop(e);if(!e.repeat)fn();return true;}
      return false;
    }
    if(alt&&!ctrl&&!shift&&/^Digit[1-4]$/.test(code)){
      stop(e);
      const tabs=['map','edit','view','reports'];
      setMode(tabs[Number(code.slice(-1))-1]);return true;
    }
    if(ctrl||alt)return false;  // Keep OS and browser combinations intact.
    if(!activeEditor()||modal)return false;
    if(DELTAS[e.key]){
      const handled=handleArrows(e);
      if(handled){stop(e);return true;}
      return false;
    }
    if(e.repeat){ // Avoid holding a key and deleting/duplicating dozens of seats.
      if(['Equal','Minus','NumpadAdd','NumpadSubtract'].includes(code)){
        stop(e);zoomScale(code==='Equal'||code==='NumpadAdd'?1.12:1/1.12);return true;
      }
      return false;
    }
    const quickTools={Digit1:'select',Digit2:'move',Digit3:'pan',Digit4:'row',Digit5:'stair'};
    const mnemonics={KeyV:'select',KeyM:'move',KeyH:'pan',KeyR:'row',KeyL:'stair'};
    let tool=null;
    if(!shift)tool=quickTools[code]||mnemonics[code];
    if(tool){stop(e);focusMode(tool);return true;}
    let fn=null;
    if(code==='Digit0'||code==='Numpad0')fn=()=>studio()?.fitAll?.();
    else if(code==='Digit9'||code==='Numpad9')fn=()=>studio()?.workScale?.();
    else if(code==='Equal'||code==='NumpadAdd')fn=()=>zoomScale(1.12);
    else if(code==='Minus'||code==='NumpadSubtract')fn=()=>zoomScale(1/1.12);
    else if(code==='BracketLeft')fn=()=>navigateSeat(-1);
    else if(code==='BracketRight')fn=()=>navigateSeat(1);
    else if(code==='PageUp')fn=()=>navigateRow(1,ux()?.getTool()!=='row');
    else if(code==='PageDown')fn=()=>navigateRow(-1,ux()?.getTool()!=='row');
    else if(code==='Home')fn=()=>goEdge(false);
    else if(code==='End')fn=()=>goEdge(true);
    else if(code==='KeyF'||code==='Slash'&&!shift)fn=openFinder;
    else if(code==='F2'||code==='Enter')fn=focusNumber;
    else if(code==='KeyN')fn=shift?()=>el('studioAddRow').click():()=>el('studioAddSeat').click();
    else if(code==='KeyB'&&!shift)fn=showBatch;
    else if(code==='KeyD'&&shift)fn=duplicate;
    else if(code==='Delete'||code==='Backspace')fn=removeSelected;
    else if(code==='KeyG')fn=()=>el(shift?'studioSeatGapRemove':'studioSeatGapAdd').click();
    else if(code==='KeyL'&&shift)fn=()=>el('studioSeatInnerStair').click();
    else if(code==='KeyR'&&shift)fn=()=>{const row=getRow();if(row&&!row.locked){renumberRow(row);changed();}};
    else if(code==='KeyK'&&!shift)fn=toggleLock;
    else if(code==='KeyE'&&!shift)fn=()=>el('studioOpenSettings').click();
    else if(code==='KeyI'&&!shift)fn=showSeat;
    else if(code==='KeyC'&&!shift)fn=()=>el('uxCheck').click();
    else if(code==='KeyP'&&!shift)fn=()=>setMode('view');
    if(fn){stop(e);fn();return true;}
    return false;
  }
  // Capture shortcuts before legacy Arrow and Ctrl+S handlers, without double dispatch.
  document.addEventListener('keydown',handle,true);
  window.ArenaHotkeys={handle,openHelp,openFinder,help:HELP,copySelection,pasteSelection,closeHelp};
})();
