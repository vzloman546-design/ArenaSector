/* ArenaSector workstation. All data stays in the browser. */
(() => {
  'use strict';
  const el=id=>document.getElementById(id);
  const frame=document.querySelector('#editView .studio-stage');
  const board=document.querySelector('#editView .ux-board');
  const inspector=el('uxInspector');
  if(!frame||!board||!inspector)return;

  let tool='select', selectedRows=new Set(), stairIndex=-1;
  let pan=null, stairDrag=null, space=false, lastSnapshot='', history=[], future=[];
  let restoring=false, bypassExport=false, inspected=false, selectedIssue=null;
  const limit=45,versionKey='ArenaSector-versions-v1';
  const esc=safeText;
  const rowById=id=>getSector().rows.find(row=>row.id===id);
  const isEdit=()=>mode==='edit';
  const serial=()=>JSON.stringify(project);
  const compact=n=>String(n);
  const mobile=()=>window.innerWidth<=710;

  // Existing SVG drag handler delegates to this explicit move tool.
  window.ArenaUX={
    canDragSeat(rowId){return tool==='move'&&!rowById(rowId)?.locked},
    getTool(){return tool},
    check:checkDiagram,
    undo,redo
  };

  const originalChanged=changed;
  changed=function(rebuild=true){
    if(!restoring){
      const current=serial();
      if(lastSnapshot&&current!==lastSnapshot){
        history.push(lastSnapshot);if(history.length>limit)history.shift();
        future=[];
      }
      lastSnapshot=current;
    }
    const result=originalChanged(rebuild);
    updateHistoryButtons();
    scheduleInspector();
    return result;
  };
  function updateHistoryButtons(){
    el('uxUndo').disabled=!history.length;
    el('uxRedo').disabled=!future.length;
  }
  function restoreSnapshot(snapshot){
    restoring=true;
    try{
      project=JSON.parse(snapshot);
      if(!project.sectors[chosen])chosen='138';
      if(!getSector().rows.some(row=>row.id===selectedRow))selectedRow=getSector().rows[0]?.id||null;
      if(!getRow()?.seats.some(s=>s.id===selectedSeat))selectedSeat=null;
      selectedRows=new Set([...selectedRows].filter(id=>rowById(id)));
      lastSnapshot=serial();
      originalChanged(true);
    }finally{restoring=false}
    updateHistoryButtons();scheduleInspector();
  }
  function undo(){
    if(!history.length)return;
    future.push(serial());
    restoreSnapshot(history.pop());
  }
  function redo(){
    if(!future.length)return;
    history.push(serial());
    restoreSnapshot(future.pop());
  }
  el('uxUndo').addEventListener('click',undo);
  el('uxRedo').addEventListener('click',redo);
  document.addEventListener('keydown',event=>{
    const tag=document.activeElement?.tagName;
    const typing=['INPUT','TEXTAREA','SELECT'].includes(tag)||document.activeElement?.isContentEditable;
    if(event.key===' '&&!typing&&isEdit())space=true;
    if(typing)return;
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){
      event.preventDefault();event.shiftKey?redo():undo();
    }else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='y'){
      event.preventDefault();redo();
    }
  },true);
  document.addEventListener('keyup',e=>{if(e.key===' ')space=false});
  window.addEventListener('blur',()=>space=false);

  function setTool(next){
    tool=next;
    board.classList.remove('tool-select','tool-move','tool-pan','tool-row','tool-stair');
    board.classList.add('tool-'+next);
    for(const btn of board.querySelectorAll('[data-ux-tool]'))
      btn.setAttribute('aria-pressed',String(btn.dataset.uxTool===next));
    if(next==='row'){
      if(getRow())selectedRows.add(getRow().id);
      selectedSeat=null;
    } else if(next!=='stair')stairIndex=-1;
    if(next==='pan')frame.style.touchAction='none';
    else frame.style.touchAction='';
    renderInspector();
  }
  board.querySelectorAll('[data-ux-tool]').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.uxTool)));
  el('uxInspectorClose').addEventListener('click',()=>{
    inspected=false;inspector.classList.add('is-hidden');inspector.classList.remove('is-open');
  });
  function openInspector(){
    inspected=true;inspector.classList.remove('is-hidden');
    if(mobile())inspector.classList.add('is-open');
  }
  const mobileButton=document.createElement('button');
  mobileButton.className='ux-mobile-inspector-open';
  mobileButton.type='button';mobileButton.textContent='Свойства';
  mobileButton.addEventListener('click',()=>{
    if(inspector.classList.contains('is-open'))inspector.classList.remove('is-open');
    else openInspector();
  });
  board.appendChild(mobileButton);

  // Preserve a useful editing scale rather than shrinking the entire sector.
  function manualScale(value,center=false){
    if(!isEdit())return;
    // The old Zoom+ handler disables the automatic "fit" mode.
    el('zoomEditIn').click();
    zoom.edit=Math.max(.35,Math.min(2.5,Number(value)||1));
    renderPreview('edit');
    if(center){frame.scrollLeft=Math.max(0,(frame.scrollWidth-frame.clientWidth)/2);frame.scrollTop=Math.max(0,(frame.scrollHeight-frame.clientHeight)/2)}
  }
  el('uxWorkScale').addEventListener('click',()=>manualScale(1,true));
  el('uxFitAll').addEventListener('click',()=>el('studioFit').click());
  frame.addEventListener('wheel',event=>{
    if(!isEdit()||!event.ctrlKey)return;
    event.preventDefault();
    manualScale(zoom.edit*(event.deltaY<0?1.12:.89));
  },{passive:false});
  // Drag empty canvas by middle mouse/Space, or use the Hand tool on touch.
  frame.addEventListener('pointerdown',event=>{
    if(!isEdit())return;
    const dragging=tool==='pan'||space||event.button===1;
    if(!dragging)return;
    if(event.target.closest('button,input,select'))return;
    event.preventDefault();event.stopPropagation();
    pan={id:event.pointerId,x:event.clientX,y:event.clientY,left:frame.scrollLeft,top:frame.scrollTop};
    board.classList.add('is-panning');
    frame.setPointerCapture?.(event.pointerId);
  },true);
  frame.addEventListener('pointermove',event=>{
    if(!pan||pan.id!==event.pointerId)return;
    frame.scrollLeft=pan.left-(event.clientX-pan.x);
    frame.scrollTop=pan.top-(event.clientY-pan.y);
  },true);
  const stopPan=()=>{pan=null;board.classList.remove('is-panning')};
  frame.addEventListener('pointerup',stopPan,true);
  frame.addEventListener('pointercancel',stopPan,true);

  // Select a whole row without dragging seats. Ctrl/Cmd-click adds another.
  frame.addEventListener('pointerdown',event=>{
    if(!isEdit()||tool!=='row')return;
    const hit=event.target.closest('[data-row]');
    if(!hit)return;
    event.preventDefault();
    const id=hit.dataset.row;
    if(!event.ctrlKey&&!event.metaKey&&!event.shiftKey)selectedRows.clear();
    if(selectedRows.has(id)&&(event.ctrlKey||event.metaKey))selectedRows.delete(id);
    else selectedRows.add(id);
    selectedRow=id;selectedSeat=null;
    event.stopImmediatePropagation();
    renderRowSelectionOnly();
    renderInspector();
  },true);
  // Click an actual chair to edit its properties, never automatically drag in selection mode.
  frame.addEventListener('pointerup',e=>{
    if(!isEdit()||tool==='pan'||tool==='row'||tool==='stair')return;
    if(!e.target.closest('[data-seat]'))return;
    requestAnimationFrame(()=>renderInspector());
  },false);

  // Direct adjustment of fixed-X stairways. Stored positions are not seat numbers.
  frame.addEventListener('pointerdown',event=>{
    if(!isEdit()||tool!=='stair')return;
    const marker=event.target.closest('.vertical-stairway');
    if(!marker)return;
    const svg=marker.closest('svg');
    if(!svg?.getScreenCTM())return;
    const all=[...svg.querySelectorAll('.vertical-stairway')];
    const index=all.indexOf(marker);
    const cuts=verticalStairCuts(getSector());
    if(index<0||index>=cuts.length)return;
    const pt=svg.createSVGPoint();pt.x=event.clientX;pt.y=event.clientY;
    const pos=pt.matrixTransform(svg.getScreenCTM().inverse());
    stairIndex=index;
    stairDrag={pointer:event.pointerId,index,initial:cuts[index],x:pos.x,svg,marker,dx:0};
    event.preventDefault();event.stopImmediatePropagation();
    renderInspector();
  },true);
  frame.addEventListener('pointermove',event=>{
    if(!stairDrag||event.pointerId!==stairDrag.pointer)return;
    const pt=stairDrag.svg.createSVGPoint();pt.x=event.clientX;pt.y=event.clientY;
    const pos=pt.matrixTransform(stairDrag.svg.getScreenCTM().inverse());
    stairDrag.dx=Math.round((pos.x-stairDrag.x)/4)*4;
    stairDrag.marker.setAttribute('transform','translate('+stairDrag.dx+' 0)');
  },true);
  frame.addEventListener('pointerup',event=>{
    if(!stairDrag||event.pointerId!==stairDrag.pointer)return;
    const d=stairDrag;stairDrag=null;
    if(!d.dx)return;
    const cuts=verticalStairCuts(getSector());
    const newX=d.initial+d.dx;
    if(Math.abs(newX)>50000||cuts.some((v,i)=>i!==d.index&&Math.abs(v-newX)<18)){
      toast('Лестницы слишком близко');d.marker.removeAttribute('transform');return;
    }
    getSector().stairLines=cuts.map((v,i)=>i===d.index?newX:v).sort((a,b)=>a-b);
    changed();stairIndex=verticalStairCuts(getSector()).indexOf(newX);
  },true);

  function rowCenter(row){
    if(!row?.seats.length)return null;
    const layout=rowStairLayout(row,getSector());
    return layout.ordered[Math.floor(layout.ordered.length/2)];
  }
  function focusRow(id){
    selectedRow=id;selectedSeat=null;selectedRows=new Set([id]);
    renderRowSelectionOnly();
    const row=rowById(id),seat=rowCenter(row);
    const hit=seat&&el('editCanvas').querySelector('[data-seat="'+seat.id+'"]');
    if(hit){
      const svg=hit.closest('svg');
      const box=hit.querySelector('rect');
      if(svg&&box){
        const scale=zoom.edit,x=Number(box.getAttribute('x'))*scale,y=Number(box.getAttribute('y'))*scale;
        frame.scrollLeft=Math.max(0,x-frame.clientWidth/2);
        frame.scrollTop=Math.max(0,y-frame.clientHeight/2);
      }
    }
    renderInspector();
  }
  function issuesForCurrent(){
    const sector=getSector(),issues=[];
    for(const row of sector.rows){
      const labels=new Set();
      for(const seat of row.seats){
        if(labels.has(seat.number))issues.push({severity:'error',rowId:row.id,seatId:seat.id,text:'Ряд '+row.label+': повтор номера '+seat.number});
        labels.add(seat.number);
      }
      const layout=rowStairLayout(row,sector);
      const ss=layout.ordered;
      for(let i=0;i<ss.length;i++)for(let k=i+1;k<ss.length;k++){
        const a=ss[i],b=ss[k],ax=layout.displayX.get(a.id),bx=layout.displayX.get(b.id);
        if(ax+seatWidth(a)>bx+2&&Math.abs(a.y-b.y)<27){
          issues.push({severity:'error',rowId:row.id,seatId:b.id,text:'Ряд '+row.label+': пересечение мест '+a.number+' и '+b.number});break;
        }
      }
      for(const cut of verticalStairCuts(sector)){
        const cutLeft=cut+verticalStairCuts(sector).indexOf(cut)*VERTICAL_STAIR_GAP+VERTICAL_STAIR_INSET;
        for(const seat of ss){
          const x=layout.displayX.get(seat.id);
          if(x<cutLeft+VERTICAL_STAIR_WIDTH&&x+seatWidth(seat)>cutLeft+3){
            issues.push({severity:'warning',rowId:row.id,seatId:seat.id,text:'Ряд '+row.label+': лестница пересекает место '+seat.number});
            break;
          }
        }
      }
    }
    return issues;
  }
  function highlightIssues(issues){
    el('editCanvas').querySelectorAll('.seat.ux-problem').forEach(x=>x.classList.remove('ux-problem'));
    for(const issue of issues){
      if(!issue.seatId)continue;
      el('editCanvas').querySelector('[data-seat="'+issue.seatId+'"]')?.classList.add('ux-problem');
    }
  }
  let issues=[];
  function checkDiagram(){
    issues=issuesForCurrent();
    el('uxCheckSummary').textContent=issues.length?issues.length+' замечаний':'Ошибок не найдено';
    el('uxCheckResults').innerHTML=issues.length?issues.map((issue,i)=>
      '<div class="ux-issue ux-'+issue.severity+'"><div><strong>'+esc(issue.text)+'</strong></div>'+
      '<button class="btn small" data-ux-issue="'+i+'">Показать</button></div>'
    ).join(''):'<div class="ux-modal-empty">Схема проверена. Замечаний не обнаружено.</div>';
    highlightIssues(issues);
    el('uxCheckDialog').showModal();
    return issues;
  }
  el('uxCheck').addEventListener('click',checkDiagram);
  el('uxCheckResults').addEventListener('click',e=>{
    const b=e.target.closest('[data-ux-issue]');if(!b)return;
    const issue=issues[Number(b.dataset.uxIssue)];
    el('uxCheckDialog').close();
    if(!issue)return;
    focusRow(issue.rowId);selectedSeat=issue.seatId;
    renderRowSelectionOnly();renderInspector();
  });
  el('uxCheckDismiss').addEventListener('click',()=>el('uxCheckDialog').close());
  el('uxExportAnyway').addEventListener('click',()=>{
    el('uxCheckDialog').close();
    bypassExport=true;el('exportPngBtn').click();bypassExport=false;
  });
  // Audit on PNG export; allow an explicit override from the report dialog.
  el('exportPngBtn').addEventListener('click',e=>{
    if(bypassExport)return;
    const errs=issuesForCurrent();
    if(errs.length){
      e.preventDefault();e.stopImmediatePropagation();
      checkDiagram();
    }
  },true);

  function loadVersions(){
    try{
      const arr=JSON.parse(localStorage.getItem(versionKey)||'[]');
      return Array.isArray(arr)?arr.filter(v=>v&&typeof v.snapshot==='string').slice(0,8):[];
    }catch{return []}
  }
  function writeVersion(){
    const list=loadVersions();
    const stamp=new Date().toISOString();
    list.unshift({date:stamp,sector:chosen,snapshot:serial()});
    try{localStorage.setItem(versionKey,JSON.stringify(list.slice(0,5)));toast('Версия сохранена')}
    catch{toast('Не удалось сохранить версию. Скачай JSON-проект')}
    renderVersions();
  }
  function renderVersions(){
    const list=loadVersions();
    el('uxVersionsList').innerHTML=list.length?list.map((v,i)=>
      '<div class="ux-version-item"><div><strong>'+esc(new Date(v.date).toLocaleString('ru-RU'))+
      '</strong><small>Сектор '+esc(v.sector)+'</small></div>'+
      '<button class="btn small" data-ux-restore="'+i+'">Восстановить</button></div>'
    ).join(''):'<div class="ux-modal-empty">Сохранённых версий пока нет</div>';
  }
  el('uxVersions').addEventListener('click',()=>{renderVersions();el('uxVersionsDialog').showModal()});
  el('uxSaveVersion').addEventListener('click',writeVersion);
  el('uxVersionsList').addEventListener('click',e=>{
    const b=e.target.closest('[data-ux-restore]');if(!b)return;
    const v=loadVersions()[Number(b.dataset.uxRestore)];if(!v)return;
    if(!confirm('Восстановить эту версию? Текущие изменения можно будет отменить.'))return;
    try{const p=JSON.parse(v.snapshot);validateImport(p)}catch{toast('Версия повреждена');return}
    history.push(serial());if(history.length>limit)history.shift();
    future=[];restoreSnapshot(v.snapshot);
    el('uxVersionsDialog').close();toast('Версия восстановлена');
  });
  document.querySelectorAll('[data-ux-close]').forEach(b=>b.addEventListener('click',()=>el(b.dataset.uxClose).close()));

  // Batch generation: normal row structures, preserving project schema.
  el('uxBatchOpen').addEventListener('click',()=>{
    el('studioRowsDialog').close();
    el('uxBatchStart').value=String(getSector().rows.length+1);
    el('uxBatchDialog').showModal();
  });
  el('uxBatchForm').addEventListener('submit',e=>{
    e.preventDefault();
    const from=Number(el('uxBatchStart').value),count=Number(el('uxBatchRows').value),
      seats=Number(el('uxBatchSeats').value),direction=el('uxBatchDirection').value;
    if(!Number.isInteger(from)||from<1||!Number.isInteger(count)||count<1||count>50||
      !Number.isInteger(seats)||seats<1||seats>250||getSector().rows.length+count>300){
      toast('Проверь количество рядов и мест');return;
    }
    const names=new Set(getSector().rows.map(r=>r.label));
    for(let i=0;i<count;i++)if(names.has(String(from+i))){toast('Ряд '+(from+i)+' уже существует');return}
    for(let i=0;i<count;i++){
      const row=createRow(String(from+i),seats);
      if(direction==='rtl')row.seats.forEach((s,j)=>s.number=String(seats-j));
      getSector().rows.push(row);
      selectedRow=row.id;
    }
    selectedSeat=null;selectedRows=new Set([selectedRow]);
    changed();el('uxBatchDialog').close();toast('Ряды добавлены: '+count);
  });

  // Row groups, seat and stairs share one contextual inspector.
  function selectedGroup(){
    return [...selectedRows].map(rowById).filter(Boolean);
  }
  function editRowProp(id,value){
    const row=rowById(id);if(!row||row.locked)return;
    const next=value.trim();
    if(!next||getSector().rows.some(r=>r!==row&&r.label===next)){toast('Номер ряда уже занят');return}
    row.label=next;changed();
  }
  function shiftRows(dx,dy){
    const rows=selectedGroup().filter(r=>!r.locked);
    if(!rows.length){toast('Выбранные ряды заблокированы');return}
    for(const row of rows)for(const seat of row.seats){seat.x+=dx;seat.y+=dy}
    changed();
  }
  function lockRows(value){
    for(const row of selectedGroup())row.locked=value;
    changed();
  }
  function duplicateRows(){
    const sector=getSector(),rows=selectedGroup();
    if(sector.rows.length+rows.length>300){toast('Слишком много рядов');return}
    const used=new Set(sector.rows.map(r=>r.label));
    for(const row of rows){
      let n=Number(row.label);
      let name;
      if(Number.isInteger(n)){
        n++;while(used.has(String(n)))n++;
        name=String(n);
      }else{
        let i=2;name=row.label+' ('+i+')';
        while(used.has(name)){i++;name=row.label+' ('+i+')'}
      }
      used.add(name);
      const copy={...structuredClone(row),id:uid(),label:name,locked:false,
        seats:row.seats.map(seat=>({...structuredClone(seat),id:uid()}))};
      sector.rows.splice(sector.rows.indexOf(row)+1,0,copy);
    }
    changed();
  }
  function inspectorHtml(){
    const sector=getSector(),row=getRow(),seat=getSeat(),group=selectedGroup();
    if(tool==='stair'){
      const cuts=verticalStairCuts(sector);
      const outer=sector.stairSide||'none';
      const toggles='<div class="ux-prop-row">'+
        '<button type="button" class="btn" data-ux-action="side-left" aria-pressed="'+String(['left','both'].includes(outer))+'">Слева</button>'+
        '<button type="button" class="btn" data-ux-action="side-right" aria-pressed="'+String(['right','both'].includes(outer))+'">Справа</button></div>';
      return {title:'Лестницы',body:'<div class="ux-properties">'+
        '<button class="btn primary" data-ux-action="stair-add">＋ Поставить на схеме</button>'+toggles+
        (cuts.length?'<div class="ux-divider"></div>'+cuts.map((x,i)=>
          '<div class="ux-prop-row"><span class="ux-row-chip">Лестница '+(i+1)+'</span>'+
          '<button class="btn" data-ux-action="stair-left" data-ux-x="'+x+'">←</button>'+
          '<button class="btn" data-ux-action="stair-right" data-ux-x="'+x+'">→</button>'+
          '<button class="btn ux-danger" data-ux-action="stair-remove" data-ux-x="'+x+'">✕</button></div>').join(''):'')+
        '</div>'};
    }
    if(tool==='row'||group.length>1){
      const n=group.length;
      return {title:n>1?'Ряды · '+n:row?'Ряд '+esc(row.label):'Ряды',body:
        '<div class="ux-properties"><div class="ux-mini-info">Нажимай на кресла разных рядов, чтобы выбрать несколько.</div>'+
        '<div class="ux-prop-row"><button class="btn" data-ux-action="row-select-all">Все ряды</button>'+
        '<button class="btn" data-ux-action="row-clear">Снять выбор</button></div>'+
        '<div class="ux-inline-actions">'+['left','right','up','down'].map(d=>
          '<button class="btn" data-ux-action="rows-'+d+'">'+({left:'←',right:'→',up:'↑',down:'↓'}[d])+'</button>').join('')+'</div>'+
        '<div class="ux-prop-row"><button class="btn" data-ux-action="rows-align">Выровнять</button>'+
        '<button class="btn" data-ux-action="rows-copy">Дублировать</button></div>'+
        '<div class="ux-prop-row"><button class="btn" data-ux-action="rows-lock">Заблокировать</button>'+
        '<button class="btn" data-ux-action="rows-unlock">Разблокировать</button></div>'+
        '<div class="ux-prop-row"><button class="btn ux-danger" data-ux-action="rows-delete">Удалить</button></div>'+
        '</div>'};
    }
    if(seat&&tool!=='pan'){
      return {title:'Ряд '+esc(row.label)+' · место '+esc(seat.number),body:
        '<div class="ux-properties">'+
        '<div class="ux-property"><label for="uxSeatNumber">Номер места</label>'+
        '<input class="field" id="uxSeatNumber" maxlength="16" value="'+esc(seat.number)+'"></div>'+
        '<div class="ux-inline-actions">'+['left','right','up','down'].map(d=>
          '<button class="btn" data-ux-action="seat-'+d+'">'+({left:'←',right:'→',up:'↑',down:'↓'}[d])+'</button>').join('')+'</div>'+
        '<div class="ux-prop-row"><button class="btn" data-ux-action="gap-add">＋ Промежуток</button>'+
        '<button class="btn" data-ux-action="seat-stair">＋ Лестница</button></div>'+
        '<div class="ux-prop-row"><button class="btn ux-danger" data-ux-action="seat-delete">Удалить место</button></div>'+
        '</div>'};
    }
    if(row){
      return {title:'Ряд '+esc(row.label),body:
        '<div class="ux-properties"><div class="ux-property"><label for="uxRowNumber">Номер ряда</label>'+
        '<input class="field" id="uxRowNumber" maxlength="20" value="'+esc(row.label)+'"></div>'+
        '<label class="ux-lock-label"><input type="checkbox" id="uxRowLocked" '+(row.locked?'checked':'')+'> Заблокировать ряд</label>'+
        '<div class="ux-prop-row"><button class="btn" data-ux-action="row-reverse">⇄ Нумерация</button>'+
        '<button class="btn" data-ux-action="row-align">Выровнять</button></div>'+
        '<div class="ux-prop-row"><button class="btn" data-ux-action="row-copy">Дублировать</button>'+
        '<button class="btn ux-danger" data-ux-action="row-delete">Удалить</button></div>'+
        '</div>'};
    }
    return {title:'Схема',body:'<div class="ux-placeholder">Выбери кресло или ряд на схеме.</div>'+
      '<div class="ux-prop-row"><button class="btn" data-ux-action="new-row">＋ Ряд</button>'+
      '<button class="btn" data-ux-action="batch">＋ Несколько рядов</button></div>'};
  }
  function renderInspector(){
    if(!isEdit())return;
    const ui=inspectorHtml();
    el('uxInspectorTitle').textContent=ui.title;
    // Do not lose keyboard input focus when other controls trigger a redraw.
    if(['uxSeatNumber','uxRowNumber'].includes(document.activeElement?.id))return;
    el('uxInspectorBody').innerHTML=ui.body;
    if(!mobile()&&ui.title!=='Схема'){openInspector()}
    else if(ui.title==='Схема'&&!inspected){inspector.classList.add('is-hidden')}
  }
  let inspectorRaf=0;
  function scheduleInspector(){
    if(inspectorRaf)cancelAnimationFrame(inspectorRaf);
    inspectorRaf=requestAnimationFrame(()=>{inspectorRaf=0;renderInspector()});
  }
  const dxy={left:[-16,0],right:[16,0],up:[0,-16],down:[0,16]};
  el('uxInspectorBody').addEventListener('change',e=>{
    if(e.target.id==='uxSeatNumber'){
      const row=getRow(),seat=getSeat(),value=e.target.value.trim();
      if(!seat||!row)return;
      if(!value||row.seats.some(s=>s!==seat&&s.number===value)){toast('Номер уже существует');e.target.value=seat.number;return}
      seat.number=value;changed();
    }else if(e.target.id==='uxRowNumber')editRowProp(selectedRow,e.target.value);
    else if(e.target.id==='uxRowLocked'){
      const row=getRow();if(row){row.locked=e.target.checked;changed()}
    }
  });
  el('uxInspectorBody').addEventListener('click',e=>{
    const button=e.target.closest('[data-ux-action]');
    if(!button)return;
    const action=button.dataset.uxAction,sector=getSector(),row=getRow(),seat=getSeat();
    if(action==='new-row')return el('studioAddRow').click();
    if(action==='batch')return el('uxBatchOpen').click();
    if(action==='row-select-all'){selectedRows=new Set(sector.rows.map(r=>r.id));return renderInspector()}
    if(action==='row-clear'){selectedRows.clear();return renderInspector()}
    if(action.startsWith('rows-')){
      const a=action.slice(5);
      if(dxy[a])return shiftRows(...dxy[a]);
      if(a==='lock')return lockRows(true);
      if(a==='unlock')return lockRows(false);
      if(a==='copy')return duplicateRows();
      if(a==='align'){
        const rows=selectedGroup().filter(r=>!r.locked);
        if(!rows.length)return;
        for(const r of rows){
          let x=0;for(const s of [...r.seats].sort((a,b)=>a.x-b.x)){s.x=x;s.y=0;x+=seatWidth(s)+6}
        }
        return changed();
      }
      if(a==='delete'){
        if(!confirm('Удалить выделенные ряды ('+selectedGroup().length+')?'))return;
        const ids=new Set(selectedGroup().map(r=>r.id));
        sector.rows=sector.rows.filter(r=>!ids.has(r.id)||r.locked);
        selectedRows.clear();selectedRow=sector.rows[0]?.id||null;selectedSeat=null;
        return changed();
      }
    }
    if(action.startsWith('seat-')&&dxy[action.slice(5)]){
      if(!seat||row?.locked)return;
      const delta=dxy[action.slice(5)];seat.x+=delta[0];seat.y+=delta[1];return changed();
    }
    if(action==='gap-add')return el('studioSeatGapAdd').click();
    if(action==='seat-stair')return el('studioSeatInnerStair').click();
    if(action==='seat-delete')return el('studioSeatDelete').click();
    if(action==='row-reverse'){if(!row?.locked){renumberRow(row);changed()}return}
    if(action==='row-align'){if(!row?.locked){let x=0;for(const s of [...row.seats].sort((a,b)=>a.x-b.x)){s.x=x;s.y=0;x+=seatWidth(s)+6}changed()}return}
    if(action==='row-copy'){selectedRows=new Set([selectedRow]);return duplicateRows()}
    if(action==='row-delete'){selectedRows=new Set([selectedRow]);return el('uxInspectorBody').querySelector('[data-ux-action="rows-delete"]')?.click()||deleteSelectedRow()}
    if(action==='stair-add')return el('studioPlaceStairLine').click();
    if(action.startsWith('side-'))return el(action==='side-left'?'studioStairLeft':'studioStairRight').click();
    if(action.startsWith('stair-')){
      const x=Number(button.dataset.uxX),lines=verticalStairCuts(sector);
      if(!lines.includes(x))return;
      if(action==='stair-remove'){
        sector.stairLines=lines.filter(v=>v!==x);if(!sector.stairLines.length)delete sector.stairLines;
      }else{
        const delta=action==='stair-left'?-4:4,after=x+delta;
        if(lines.some(v=>v!==x&&Math.abs(v-after)<16))return;
        sector.stairLines=lines.map(v=>v===x?after:v).sort((a,b)=>a-b);
      }
      return changed();
    }
  });
  function deleteSelectedRow(){
    const row=getRow();if(!row||row.locked)return;
    if(!confirm('Удалить ряд '+row.label+'?'))return;
    getSector().rows=getSector().rows.filter(r=>r!==row);
    selectedRow=getSector().rows[0]?.id||null;selectedSeat=null;selectedRows.clear();changed();
  }

  // Keep inspector and snapshots in step with sector changes and imported files.
  const oldChoose=choose;
  choose=function(id,next='edit'){
    selectedRows.clear();stairIndex=-1;
    const answer=oldChoose(id,next);
    scheduleInspector();return answer;
  };
  const oldRenderEditor=renderEditor;
  renderEditor=function(){
    const answer=oldRenderEditor();
    scheduleInspector();return answer;
  };
  const oldRenderPreview=renderPreview;
  renderPreview=function(kind){
    const answer=oldRenderPreview(kind);
    if(kind==='edit'&&issues.length)highlightIssues(issues);
    return answer;
  };
  window.addEventListener('arenasector:ready',()=>{
    lastSnapshot=serial();
    updateHistoryButtons();
    setTool('select');
    // For large sectors start at a legible scale; the Fit button retains the overview.
    if(isEdit())manualScale(1);
    renderInspector();
  },{once:true});
})();
