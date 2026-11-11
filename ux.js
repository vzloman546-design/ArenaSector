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
  let restoring=false, bypassExport=false, inspected=false, selectedIssue=null,editCount=0;
  const limit=45;
  const esc=safeText;
  const rowById=id=>getSector().rows.find(row=>row.id===id);
  const isEdit=()=>mode==='edit';
  // Autosave changes project.updatedAt on every write. Ignoring that metadata
  // keeps Undo/Redo limited to actual editing operations, not phantom steps.
  const serial=()=>{
    const data={...project};
    delete data.updatedAt;
    return JSON.stringify(data);
  };
  const compact=n=>String(n);
  const mobile=()=>window.innerWidth<=710;

  // Existing SVG drag handler delegates to this explicit move tool.
  window.ArenaUX={
    canDragSeat(rowId){return tool==='move'&&!rowById(rowId)?.locked},
    getTool(){return tool},
    setTool(next){return setTool(next);},
    focusRow(id){return focusRow(id);},
    selectSeat(rowId,seatId){
      const row=rowById(rowId);
      if(!row||!row.seats.some(seat=>seat.id===seatId))return false;
      if(tool==='row'||tool==='stair'||tool==='pan')setTool('select');
      selectedRow=rowId;selectedSeat=seatId;
      selectedRows.clear();stairIndex=-1;
      multiSelectEnabled=false;multiSelectedSeatIds.clear();
      renderRowSelectionOnly();renderSeatEditor();renderInspector();openInspector();
      return true;
    },
    selectRow(rowId){
      const row=rowById(rowId);if(!row)return false;
      if(tool==='stair'||tool==='pan')setTool('select');
      selectedRow=rowId;selectedSeat=null;stairIndex=-1;
      selectedRows=new Set([rowId]);
      multiSelectEnabled=false;multiSelectedSeatIds.clear();
      renderRowSelectionOnly();renderSeatEditor();paintRowSelection();renderInspector();openInspector();
      return true;
    },
    selectStair(x){
      const cuts=verticalStairCuts(getSector()),index=cuts.indexOf(Number(x));
      if(index<0)return false;
      if(tool!=='stair')setTool('stair');
      window.ArenaStudio?.cancelStair();
      stairIndex=index;selectedSeat=null;selectedRows.clear();
      renderInspector();openInspector();return true;
    },
    refreshInspector(){renderInspector();},
    check:checkDiagram,
    async backupBeforeImport(){
      // The last valid project stays recoverable even when import replaces it.
      if(!db)return;
      await writeVersion(true);
      history.push(serial());
      if(history.length>limit)history.shift();
      future=[];
      updateHistoryButtons();
    },
    onImported(){
      lastSnapshot=serial();
      selectedRows.clear();
      selectedRow=getSector().rows[0]?.id||null;
      selectedSeat=null;
      updateHistoryButtons();
      scheduleInspector();
    },
    undo,redo,
    historyState(){return {undo:history.length,redo:future.length,initialized:!!lastSnapshot};},
    saveVersion(){return writeVersion(false);},
    getSelectedRowIds(){return [...selectedRows];},
    setSelectedRows(ids){
      selectedRows=new Set(ids.filter(id=>rowById(id)));
      if(selectedRows.size)selectedRow=selectedRows.values().next().value;
      paintRowSelection();renderInspector();
    },
    getSelectedStair(){return stairIndex<0?null:verticalStairCuts(getSector())[stairIndex]??null;},
    nudgeSelectedStair(delta){
      const cuts=verticalStairCuts(getSector()),current=cuts[stairIndex];
      if(current===undefined)return false;
      const next=current+delta;
      if(Math.abs(next)>50000||cuts.some((x,i)=>i!==stairIndex&&Math.abs(x-next)<16))return false;
      getSector().stairLines=cuts.map((v,i)=>i===stairIndex?next:v).sort((a,b)=>a-b);
      stairIndex=verticalStairCuts(getSector()).indexOf(next);changed();return true;
    },
    clearSelection(){selectedSeat=null;selectedRows.clear();stairIndex=-1;renderRowSelectionOnly();renderInspector();}
  };

  const originalChanged=changed;
  changed=function(rebuild=true){
    if(!restoring){
      const current=serial();
      if(lastSnapshot&&current!==lastSnapshot){
        history.push(lastSnapshot);if(history.length>limit)history.shift();
        future=[];
        editCount++;
        if(editCount%25===0)writeVersion(true).catch(()=>{});
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
    if(!history.length){toast('Нет действий для отмены');return false;}
    future.push(serial());
    restoreSnapshot(history.pop());
    return true;
  }
  function redo(){
    if(!future.length){toast('Нет отменённых действий');return false;}
    history.push(serial());
    restoreSnapshot(future.pop());
    return true;
  }
  el('uxUndo').addEventListener('click',undo);
  el('uxRedo').addEventListener('click',redo);
  // One central keyboard dispatcher in hotkeys.js handles Undo/Redo.
  // Keeping two global Ctrl+Z listeners caused inconsistent shortcut handling.
  document.addEventListener('keydown',event=>{
    const tag=document.activeElement?.tagName;
    const typing=['INPUT','TEXTAREA','SELECT'].includes(tag)||document.activeElement?.isContentEditable;
    if(event.key===' '&&!typing&&isEdit())space=true;
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
      selectedRows=new Set(getRow()?[getRow().id]:[]);
      selectedSeat=null;
    }else{
      selectedRows.clear();
      if(next!=='stair')stairIndex=-1;
    }
    if(next==='row')window.ArenaStudio?.setToolTarget('row');
    if(next==='select'||next==='move')window.ArenaStudio?.setToolTarget('seat');
    if(next==='stair')window.ArenaStudio?.beginStair();
    else window.ArenaStudio?.cancelStair();
    if(next==='pan')frame.style.touchAction='none';
    else frame.style.touchAction='';
    paintRowSelection();
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
  // Keep the point underneath the mouse stationary when zooming.
  frame.addEventListener('wheel',event=>{
    if(!isEdit())return;
    event.preventDefault();
    if(event.shiftKey&&!event.ctrlKey&&!event.metaKey){
      frame.scrollLeft+=(Math.abs(event.deltaX)>Math.abs(event.deltaY)?event.deltaX:event.deltaY);
      return;
    }
    const previous=zoom.edit;
    const amount=event.deltaMode===1?event.deltaY*15:event.deltaMode===2?event.deltaY*160:event.deltaY;
    const next=Math.max(.35,Math.min(2.5,previous*(amount<0?1.12:1/1.12)));
    if(next===previous)return;
    const area=frame.getBoundingClientRect();
    const px=Math.max(0,event.clientX-area.left);
    const py=Math.max(0,event.clientY-area.top);
    const leftBefore=frame.scrollLeft,topBefore=frame.scrollTop;
    // The canvas has 18px of fixed padding around the SVG.
    const pad=18;
    manualScale(next);
    const factor=next/previous;
    frame.scrollLeft=Math.max(0,(leftBefore+px-pad)*factor+pad-px);
    frame.scrollTop=Math.max(0,(topBefore+py-pad)*factor+pad-py);
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
    // Every tap toggles a row, including on touch screens.
    if(event.shiftKey&&selectedRow){
      const rows=getSector().rows;
      const first=rows.findIndex(row=>row.id===selectedRow),last=rows.findIndex(row=>row.id===id);
      if(first>=0&&last>=0)rows.slice(Math.min(first,last),Math.max(first,last)+1).forEach(row=>selectedRows.add(row.id));
    }else if(selectedRows.has(id))selectedRows.delete(id);
    else selectedRows.add(id);
    selectedRow=id;selectedSeat=null;
    event.stopImmediatePropagation();
    renderRowSelectionOnly();
    paintRowSelection();
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
    window.ArenaStudio?.cancelStair();
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
    if(!d.dx){window.ArenaStudio?.cancelStair();return;}
    const cuts=verticalStairCuts(getSector());
    const newX=d.initial+d.dx;
    if(Math.abs(newX)>50000||cuts.some((v,i)=>i!==d.index&&Math.abs(v-newX)<18)){
      toast('Лестницы слишком близко');d.marker.removeAttribute('transform');return;
    }
    getSector().stairLines=cuts.map((v,i)=>i===d.index?newX:v).sort((a,b)=>a-b);
    changed();stairIndex=verticalStairCuts(getSector()).indexOf(newX);
    window.ArenaStudio?.cancelStair();
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
  // Selecting a row in a list should reveal it on the diagram without resizing it.
  function followSelectedRow(){
    const id=selectedRow;
    requestAnimationFrame(()=>{
      if(isEdit()&&id&&rowById(id))focusRow(id);
    });
  }
  el('studioRow').addEventListener('change',followSelectedRow);
  el('studioRowForm').addEventListener('submit',followSelectedRow);
  el('studioRowsList').addEventListener('click',e=>{
    if(e.target.closest('[data-studio-row-action="select"]'))followSelectedRow();
  });
  function issuesForCurrent(sector=getSector(),sectorId=chosen){
    const issues=[];
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
    return issues.map(issue=>({...issue,sectorId,text:'Сектор '+sectorId+' · '+issue.text}));
  }
  function issuesForProject(){
    return Object.entries(project.sectors).flatMap(([id,section])=>section.rows.length?issuesForCurrent(section,id):[]);
  }
  function highlightIssues(issues){
    el('editCanvas').querySelectorAll('.seat.ux-problem').forEach(x=>x.classList.remove('ux-problem'));
    for(const issue of issues){
      if(issue.sectorId!==chosen||!issue.seatId)continue;
      el('editCanvas').querySelector('[data-seat="'+issue.seatId+'"]')?.classList.add('ux-problem');
    }
  }
  let issues=[];
  function checkDiagram(){
    issues=issuesForProject();
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
    if(issue.sectorId!==chosen)choose(issue.sectorId,'edit');
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
    const errs=issuesForProject();
    if(errs.length){
      e.preventDefault();e.stopImmediatePropagation();
      checkDiagram();
    }
  },true);

  // Version history is stored in the existing IndexedDB "projects" store.
  // Unlike localStorage this supports large seating plans without tiny string quotas.
  let shownVersions=[];
  const maxVersions=12;
  async function loadVersions(){
    if(!db)return [];
    return new Promise((resolve,reject)=>{
      const list=[];
      const req=db.transaction('projects','readonly').objectStore('projects').openCursor();
      req.onsuccess=()=>{
        const cursor=req.result;
        if(!cursor){resolve(list.sort((a,b)=>b.time-a.time));return;}
        if(String(cursor.key).startsWith('version:')){
          const record=cursor.value;
          if(record&&typeof record.snapshot==='string')
            list.push({key:cursor.key,...record});
        }
        cursor.continue();
      };
      req.onerror=()=>reject(req.error);
    });
  }
  async function writeVersion(automatic=false){
    if(!db){
      if(!automatic)toast('Хранилище недоступно. Скачай JSON-проект');
      return;
    }
    const now=Date.now(),key='version:'+now+':'+Math.random().toString(36).slice(2,8);
    const item={time:now,date:new Date(now).toISOString(),sector:chosen,
      label:automatic?'Автоматическая копия':'Сохранено вручную',snapshot:serial()};
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('projects','readwrite');
      tx.objectStore('projects').put(item,key);
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });
    const all=await loadVersions();
    if(all.length>maxVersions){
      await new Promise((resolve,reject)=>{
        const tx=db.transaction('projects','readwrite');
        const store=tx.objectStore('projects');
        all.slice(maxVersions).forEach(v=>store.delete(v.key));
        tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
      });
    }
    if(!automatic){toast('Версия сохранена');await renderVersions();}
  }
  async function renderVersions(){
    try{
      shownVersions=await loadVersions();
      el('uxVersionsList').innerHTML=shownVersions.length?shownVersions.map((v,i)=>
        '<div class="ux-version-item"><div><strong>'+esc(new Date(v.date||v.time).toLocaleString('ru-RU'))+
        '</strong><small>'+esc(v.label||'Копия проекта')+' · сектор '+esc(v.sector)+'</small></div>'+
        '<button class="btn small" data-ux-restore="'+i+'">Восстановить</button></div>'
      ).join(''):'<div class="ux-modal-empty">Сохранённых версий пока нет</div>';
    }catch(err){toast('Не удалось открыть версии: '+err.message);}
  }
  el('uxVersions').addEventListener('click',()=>{
    if(!db){toast('Локальное хранилище недоступно');return;}
    el('uxVersionsDialog').showModal();
    renderVersions();
  });
  el('uxSaveVersion').addEventListener('click',()=>writeVersion(false)
    .catch(err=>toast('Не удалось сохранить версию: '+err.message)));
  el('uxVersionsList').addEventListener('click',async e=>{
    const b=e.target.closest('[data-ux-restore]');if(!b)return;
    const v=shownVersions[Number(b.dataset.uxRestore)];if(!v)return;
    if(!confirm('Восстановить эту версию? Текущая схема сохранится в резервной копии.'))return;
    try{
      const p=JSON.parse(v.snapshot);
      validateImport(p);
      await writeVersion(true);
      history.push(serial());if(history.length>limit)history.shift();
      future=[];restoreSnapshot(v.snapshot);
      el('uxVersionsDialog').close();
      toast('Версия восстановлена');
    }catch(err){toast('Не удалось восстановить: '+err.message);}
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
    changed();el('uxBatchDialog').close();followSelectedRow();toast('Ряды добавлены: '+count);
  });

  // Row groups, seat and stairs share one contextual inspector.
  function selectedGroup(){
    return [...selectedRows].map(rowById).filter(Boolean);
  }
  function paintRowSelection(){
    const canvas=el('editCanvas');
    if(!canvas)return;
    for(const seat of canvas.querySelectorAll('[data-seat][data-row]')){
      seat.classList.toggle('ux-row-selected',tool==='row'&&selectedRows.has(seat.dataset.row));
      seat.classList.toggle('ux-locked-seat',!!rowById(seat.dataset.row)?.locked);
    }
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
    if(action==='row-select-all'){selectedRows=new Set(sector.rows.map(r=>r.id));paintRowSelection();return renderInspector()}
    if(action==='row-clear'){selectedRows.clear();paintRowSelection();return renderInspector()}
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
    if(action==='row-delete')return deleteSelectedRow()
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
  const oldSetMode=setMode;
  setMode=function(next){
    const result=oldSetMode(next);
    if(next==='edit')requestAnimationFrame(()=>{if(isEdit())manualScale(1)});
    return result;
  };
  // Imported project replaces the entire history baseline; preserve a pre-import copy.
  const previousDoImport=doImport;
  doImport=async function(file){
    const before=serial();
    const result=await previousDoImport(file);
    if(before!==serial()){
      // Import is also one undoable action; the original importer saves its own backup.
      if(history.at(-1)!==before)history.push(before);
      if(history.length>limit)history.shift();
      future=[];lastSnapshot=serial();updateHistoryButtons();
      selectedRows.clear();stairIndex=-1;issues=[];
    }
    return result;
  };
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
    if(kind==='edit'){
      if(issues.length)highlightIssues(issues);
      paintRowSelection();
    }
    return answer;
  };
  window.addEventListener('arenasector:ready',()=>{
    lastSnapshot=serial();
    history.length=0;future.length=0;
    updateHistoryButtons();
    setTool('select');
    // For large sectors start at a legible scale; the Fit button retains the overview.
    if(isEdit())manualScale(1);
    renderInspector();
  },{once:true});
})();
