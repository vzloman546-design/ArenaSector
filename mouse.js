/* ArenaSector mouse-first interactions. All edits reuse the application's existing data model. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const stage=document.querySelector('#editView .studio-stage');
  const canvas=$('editCanvas'),board=document.querySelector('#editView .ux-board');
  if(!stage||!canvas||!board||!window.ArenaUX)return;
  const ux=()=>window.ArenaUX,studio=()=>window.ArenaStudio,hot=()=>window.ArenaHotkeys;
  const isEdit=()=>mode==='edit';
  const rowById=id=>getSector().rows.find(row=>row.id===id);
  const sideKey='ArenaSector:mouse:sideButtons:v1';
  const readSide=()=>{try{return localStorage.getItem(sideKey)==='true';}catch{return false;}};
  let useSide=readSide(),context=null,rangeAnchor=null,rightDrag=null,lastSideEvent=0;
  const safe=safeText;
  const htmlEscape=s=>safe(String(s));

  // The actions button stays close to Undo and Redo, without occupying canvas space.
  const top=$('hotkeysHelpButton')?.parentElement||document.querySelector('.ux-history');
  const helpButton=document.createElement('button');
  helpButton.type='button';helpButton.id='mouseHelpButton';
  helpButton.className='btn small';helpButton.title='Управление мышью';helpButton.setAttribute('aria-label','Управление мышью');
  helpButton.textContent='🖱';
  top?.appendChild(helpButton);

  const dialog=document.createElement('dialog');
  dialog.id='mouseHelpDialog';dialog.className='studio-dialog mouse-help-dialog';
  dialog.setAttribute('aria-labelledby','mouseHelpTitle');
  dialog.innerHTML='<div class="studio-modal-head"><div><h2 id="mouseHelpTitle">Управление мышью</h2><span>Основные действия без клавиатуры</span></div>'+
    '<button type="button" class="studio-close" id="mouseHelpClose" aria-label="Закрыть">✕</button></div>'+
    '<div class="ux-modal-body mouse-help-body">'+
    '<div class="mouse-tip"><strong>Левая кнопка</strong><span>Выбор кресла или ряда. Инструмент «Двигать» позволяет перетаскивать кресла.</span></div>'+
    '<div class="mouse-tip"><strong>Правая кнопка</strong><span>Открывает меню действий для кресла, ряда, лестницы или пустой области.</span></div>'+
    '<div class="mouse-tip"><strong>Двойной щелчок</strong><span>По креслу или ряду — изменить номер. По пустой области — показать весь сектор.</span></div>'+
    '<div class="mouse-tip"><strong>Колесо</strong><span>Увеличить или уменьшить масштаб относительно курсора. Shift + колесо — горизонтальная прокрутка.</span></div>'+
    '<div class="mouse-tip"><strong>Нажатое колесо</strong><span>Перетащить схему в любом инструменте. Можно также выбрать «Схема» слева.</span></div>'+
    '<div class="mouse-tip"><strong>Ctrl + щелчок</strong><span>Отметить несколько кресел; Shift + щелчок — диапазон соседних мест. После этого можно объединить места.</span></div>'+
    '<div class="mouse-tip"><strong>Боковые кнопки</strong><span>При желании могут отменять и повторять изменения вместо перехода назад/вперёд в браузере. Поддержка зависит от мыши и браузера.</span></div>'+
    '<label class="mouse-toggle"><input type="checkbox" id="mouseSideButtons"><span>Использовать боковые кнопки для отмены и повтора</span></label>'+
    '</div><div class="studio-modal-footer"><button type="button" class="btn primary" id="mouseHelpDone">Готово</button></div>';
  document.body.appendChild(dialog);
  const closeHelp=()=>dialog.open&&dialog.close();
  helpButton.addEventListener('click',()=>{
    $('mouseSideButtons').checked=useSide;
    if(!dialog.open)dialog.showModal();
  });
  $('mouseHelpClose').addEventListener('click',closeHelp);
  $('mouseHelpDone').addEventListener('click',closeHelp);
  dialog.addEventListener('click',e=>{if(e.target===dialog)closeHelp();});
  $('mouseSideButtons').addEventListener('change',e=>{
    useSide=!!e.target.checked;
    try{localStorage.setItem(sideKey,String(useSide));}
    catch{toast('Не удалось сохранить настройку мыши');}
  });

  const menu=document.createElement('div');
  menu.id='mouseContextMenu';
  menu.className='mouse-context-menu';
  menu.setAttribute('role','menu');
  menu.setAttribute('aria-label','Действия с выбранным объектом');
  menu.hidden=true;
  document.body.appendChild(menu);
  const hideMenu=()=>{menu.hidden=true;context=null;};
  const entry=(action,label,opts={})=>({action,label,...opts});
  function listActions(type,obj){
    const row=rowById(obj?.rowId);
    const disabled=!!row?.locked;
    const entries=[];
    if(type==='seats'){
      const count=multiSelectedSeatIds.size;
      entries.push(entry('merge','Объединить выбранные места ('+count+')',{enabled:count>=2&&!disabled}));
      entries.push(entry('copy','Копировать выделенные места'));
      entries.push(entry('clear-selection','Снять выделение'));
      entries.push(entry('undo','↶ Отменить'),entry('redo','↷ Повторить'));
    }else if(type==='seat'){
      entries.push(entry('rename-seat','✎ Изменить номер'));
      entries.push(entry('move-seat','✥ Перетаскивать кресло',{enabled:!disabled}));
      entries.push(entry('add-seat','＋ Добавить место в ряд',{enabled:!disabled}));
      entries.push(entry('gap-after','＋ Промежуток после',{enabled:!disabled}));
      entries.push(entry('stair-after','▥ Лестница после места',{enabled:!disabled}));
      entries.push(entry('duplicate-seat','⧉ Дублировать кресло',{enabled:!disabled}));
      entries.push(entry('copy','Копировать'));
      entries.push(entry('paste','Вставить скопированное',{enabled:!disabled}));
      entries.push(entry('delete-seat','✕ Удалить место',{danger:true,enabled:!disabled}));
    }else if(type==='row'){
      entries.push(entry('rename-row','✎ Изменить номер ряда'));
      entries.push(entry('row-select','☰ Выделить ряд'));
      entries.push(entry('copy-row','⧉ Дублировать ряд'));
      entries.push(entry('lock-row',row?.locked?'◉ Разблокировать ряд':'◎ Заблокировать ряд'));
      entries.push(entry('add-seat','＋ Добавить место',{enabled:!disabled}));
      entries.push(entry('add-row','＋ Добавить ряд'));
      entries.push(entry('rows-dialog','Управление рядами…'));
      entries.push(entry('delete-row','✕ Удалить ряд',{danger:true,enabled:!disabled}));
    }else if(type==='stair'){
      entries.push(entry('stair-left','← Сдвинуть лестницу'));
      entries.push(entry('stair-right','Сдвинуть лестницу →'));
      entries.push(entry('stair-add','＋ Ещё лестница'));
      entries.push(entry('delete-stair','✕ Удалить лестницу',{danger:true}));
    }else{
      entries.push(entry('add-seat','＋ Добавить место в ряд',{enabled:!!getRow()&&!getRow().locked}));
      entries.push(entry('add-row','＋ Добавить ряд'));
      entries.push(entry('stair-add','▥ Поставить лестницу'));
      entries.push(entry('paste','Вставить скопированное'));
      entries.push(entry('fit','Весь сектор'));
      entries.push(entry('working-scale','Рабочий масштаб'));
      entries.push(entry('undo','↶ Отменить'),entry('redo','↷ Повторить'));
      entries.push(entry('mouse-help','Управление мышью…'));
    }
    return entries;
  }
  function openMenu(type,obj,x,y){
    context={type,...obj};
    const actions=listActions(type,obj);
    menu.innerHTML='<div class="mouse-menu-heading">'+
      (type==='seat'?'Место '+htmlEscape(getSeat()?.number||''):
       type==='row'?'Ряд '+htmlEscape(rowById(obj.rowId)?.label||''):
       type==='stair'?'Лестница':type==='seats'?'Выбранные места':'Сектор '+htmlEscape(chosen))+'</div>'+
      actions.map((item,i)=>'<button type="button" role="menuitem" class="mouse-menu-item'+
        (item.danger?' danger':'')+'" data-mouse-action="'+item.action+'" '+(item.enabled===false?'disabled':'')+'>'+
        item.label+'</button>').join('');
    menu.hidden=false;
    menu.style.left='0px';menu.style.top='0px';
    const box=menu.getBoundingClientRect();
    const margin=8;
    const left=Math.max(margin,Math.min(x,window.innerWidth-box.width-margin));
    const top=Math.max(margin,Math.min(y,window.innerHeight-box.height-margin));
    menu.style.left=left+'px';menu.style.top=top+'px';
  }
  function selectObject(type,obj){
    if(type==='seat'){
      return ux()?.selectSeat?.(obj.rowId,obj.seatId);
    }
    if(type==='row')return ux()?.selectRow?.(obj.rowId);
    if(type==='stair')return ux()?.selectStair?.(obj.stairX);
    return true;
  }
  function rename(type){
    if(type==='row'){
      ux()?.setTool?.('select');
      ux()?.refreshInspector?.();
      const field=$('uxRowNumber');
      if(field){field.focus();field.select?.();return;}
      $('studioOpenRows').click();return;
    }
    const field=$('uxSeatNumber');
    if(field){field.focus();field.select?.();return;}
    $('studioOpenSeat').click();
    $('studioSeatNumber')?.focus();
    $('studioSeatNumber')?.select?.();
  }
  function execute(action,target){
    const row=rowById(target?.rowId)||getRow();
    const seat=row?.seats.find(s=>s.id===target?.seatId)||getSeat();
    const hotkeys=hot(),tools=ux();
    const blocked=!!row?.locked;
    switch(action){
      case 'rename-seat':return rename('seat');
      case 'rename-row':return rename('row');
      case 'move-seat':return tools?.setTool?.('move');
      case 'add-seat':if(row&&!blocked) {selectedRow=row.id;return $('studioAddSeat').click();}return;
      case 'gap-after':if(seat&&!blocked)return $('studioSeatGapAdd').click();return;
      case 'stair-after':if(seat&&!blocked)return $('studioSeatInnerStair').click();return;
      case 'duplicate-seat':if(!blocked)return hotkeys?.copySelection?.()&&hotkeys?.pasteSelection?.();return;
      case 'copy':return hotkeys?.copySelection?.();
      case 'paste':return hotkeys?.pasteSelection?.();
      case 'delete-seat':
        if(!seat||blocked)return;
        if(!confirm('Удалить место '+seat.number+'?'))return;
        row.seats=row.seats.filter(s=>s.id!==seat.id);selectedSeat=null;changed();return;
      case 'row-select':tools?.setTool?.('row');return;
      case 'copy-row':
        if(!row)return;
        if(tools?.getTool?.()==='row')tools.setTool('select');
        selectedRow=row.id;selectedSeat=null;return hotkeys?.copySelection?.()&&hotkeys?.pasteSelection?.();
      case 'lock-row':
        if(!row)return;
        row.locked=!row.locked;changed();return;
      case 'add-row':return $('studioAddRow').click();
      case 'rows-dialog':return $('studioOpenRows').click();
      case 'delete-row':
        if(!row||blocked||!confirm('Удалить ряд '+row.label+' со всеми местами?'))return;
        getSector().rows=getSector().rows.filter(r=>r.id!==row.id);
        selectedRow=getSector().rows[0]?.id||null;
        selectedSeat=null;changed();return;
      case 'stair-left':return tools?.nudgeSelectedStair?.(-4);
      case 'stair-right':return tools?.nudgeSelectedStair?.(4);
      case 'stair-add':tools?.setTool?.('stair');return;
      case 'delete-stair':return studio()?.deleteStair?.(target.stairX);
      case 'merge':if(multiSelectedSeatIds.size>=2)return mergeSelectedSeats();return;
      case 'clear-selection':
        multiSelectEnabled=false;multiSelectedSeatIds.clear();return renderEditor();
      case 'fit':return studio()?.fitAll?.();
      case 'working-scale':return studio()?.workScale?.();
      case 'undo':return tools?.undo?.();
      case 'redo':return tools?.redo?.();
      case 'mouse-help':return helpButton.click();
    }
  }
  menu.addEventListener('click',e=>{
    const b=e.target.closest('[data-mouse-action]');
    if(!b||b.disabled||!context)return;
    const target={...context};
    hideMenu();
    execute(b.dataset.mouseAction,target);
  });
  document.addEventListener('pointerdown',e=>{
    if(!menu.hidden&&!menu.contains(e.target))hideMenu();
  },true);
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&!menu.hidden){hideMenu();e.preventDefault();e.stopImmediatePropagation?.();}
  },true);
  window.addEventListener('blur',hideMenu);
  document.addEventListener('scroll',()=>{if(!menu.hidden)hideMenu();},true);

  stage.addEventListener('contextmenu',e=>{
    if(!isEdit())return;
    if(Date.now()<suppressContextUntil){e.preventDefault();return;}
    if(e.target.closest('button,input,select,textarea,.mouse-context-menu'))return;
    e.preventDefault();e.stopPropagation();
    if(rightDrag?.moved){rightDrag=null;return;}
    const seatEl=e.target.closest('[data-seat]');
    const stairEl=e.target.closest('[data-stair-x]');
    const rowEl=e.target.closest('[data-row]');
    let type='blank',obj={};
    if(seatEl){
      obj={rowId:seatEl.dataset.row,seatId:seatEl.dataset.seat};
      if(multiSelectEnabled&&multiSelectedSeatIds.has(obj.seatId)&&multiSelectedSeatIds.size>=2){
        type='seats';
      }else{
        type='seat';
        selectObject(type,obj);
      }
    }else if(stairEl){
      type='stair';obj={stairX:Number(stairEl.dataset.stairX)};
      selectObject(type,obj);
    }else if(rowEl){
      type='row';obj={rowId:rowEl.dataset.row};
      selectObject(type,obj);
    }
    openMenu(type,obj,e.clientX,e.clientY);
  });

  stage.addEventListener('dblclick',e=>{
    if(!isEdit()||e.button!==0)return;
    const seat=e.target.closest('[data-seat]');
    const row=e.target.closest('[data-row]');
    if(seat){e.preventDefault();ux()?.selectSeat?.(seat.dataset.row,seat.dataset.seat);rename('seat');}
    else if(row){e.preventDefault();ux()?.selectRow?.(row.dataset.row);rename('row');}
    else if(!e.target.closest('button,input,select,textarea')){e.preventDefault();studio()?.fitAll?.();}
  });

  // One-handed multi-seat selection for merging or duplicating seats.
  let selectedAnchor=null;
  stage.addEventListener('pointerdown',e=>{
    if(!isEdit()||e.button!==0||!(e.ctrlKey||e.metaKey||e.shiftKey))return;
    if(!['select','move'].includes(ux()?.getTool?.()))return;
    const hit=e.target.closest('[data-seat]');
    if(!hit)return;
    const row=rowById(hit.dataset.row);
    if(!row)return;
    if(row.locked){toast('Ряд заблокирован');return;}
    const clicked=hit.dataset.seat;
    if(multiSelectedSeatIds.size&&selectedRow!==row.id){
      toast('Выбирай места одного ряда');return;
    }
    if(!multiSelectEnabled){
      const original=selectedRow===row.id?selectedSeat:null;
      multiSelectEnabled=true;multiSelectedSeatIds.clear();
      if(original)multiSelectedSeatIds.add(original);
      selectedAnchor=original||clicked;
    }
    selectedRow=row.id;selectedSeat=null;
    if(e.shiftKey){
      const ordered=rowStairLayout(row,getSector()).ordered;
      const a=ordered.findIndex(s=>s.id===selectedAnchor);
      const b=ordered.findIndex(s=>s.id===clicked);
      if(a>=0&&b>=0)for(const seat of ordered.slice(Math.min(a,b),Math.max(a,b)+1))
        multiSelectedSeatIds.add(seat.id);
    }else{
      if(multiSelectedSeatIds.has(clicked))multiSelectedSeatIds.delete(clicked);
      else multiSelectedSeatIds.add(clicked);
      selectedAnchor=clicked;
    }
    e.preventDefault();e.stopImmediatePropagation?.();
    renderRowSelectionOnly();renderSeatEditor();ux()?.refreshInspector?.();
  },true);

  // Right-button dragging on an empty area pans the canvas; a stationary click still opens the menu.
  stage.addEventListener('pointerdown',e=>{
    if(!isEdit()||e.button!==2||e.target.closest('[data-seat],[data-stair-x],button,input,select'))return;
    rightDrag={id:e.pointerId,x:e.clientX,y:e.clientY,left:stage.scrollLeft,top:stage.scrollTop,moved:false};
  },true);
  document.addEventListener('pointermove',e=>{
    if(!rightDrag||e.pointerId!==rightDrag.id)return;
    if(Math.abs(e.clientX-rightDrag.x)+Math.abs(e.clientY-rightDrag.y)>8)rightDrag.moved=true;
    if(!rightDrag.moved)return;
    stage.scrollLeft=rightDrag.left-(e.clientX-rightDrag.x);
    stage.scrollTop=rightDrag.top-(e.clientY-rightDrag.y);
    e.preventDefault();
  },true);
  document.addEventListener('pointerup',e=>{
    if(!rightDrag||e.pointerId!==rightDrag.id)return;
    if(rightDrag.moved){
      // A contextmenu event may arrive after pointerup; suppress it briefly.
      const mark=rightDrag;rightDrag=null;
      suppressContextUntil=Date.now()+350;
    }else rightDrag=null;
  },true);
  let suppressContextUntil=0;
  // Also suppress the context menu after a completed right-button pan.
  stage.addEventListener('contextmenu',e=>{
    if(Date.now()<suppressContextUntil){e.preventDefault();e.stopImmediatePropagation?.();}
  },true);

  function sideButton(e){
    if(!isEdit()||!useSide||![3,4].includes(e.button))return;
    if(e.target.closest('#mouseHelpDialog'))return;
    const now=Date.now();
    if(now-lastSideEvent<180){e.preventDefault();return;}
    lastSideEvent=now;
    e.preventDefault();e.stopImmediatePropagation?.();
    if(e.button===3)ux()?.undo?.();
    else ux()?.redo?.();
  }
  document.addEventListener('pointerdown',sideButton,true);
  document.addEventListener('auxclick',sideButton,true);

  window.ArenaMouse={openMenu,hideMenu,execute,openHelp(){helpButton.click()},sideButtonsEnabled(){return useSide;}};
})();
