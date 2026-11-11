/* Studio UI, layered on existing seat data, drag handling, and exports. */
(() => {
  'use strict';
  const $s=id=>document.getElementById(id);
  const host=$s('editView'),canvas=$s('editCanvas'),frame=host?.querySelector('.studio-stage');
  if(!host||!canvas||!frame||!$s('studioSector'))return;

  const rowDialog=$s('studioRowsDialog');
  const seatDialog=$s('studioSeatDialog');
  const settingsDialog=$s('studioSettingsDialog');
  const allDialogs=[rowDialog,seatDialog,settingsDialog];
  let target='row';
  let autoFit=true;
  let raf=0;
  let initialFit=true;

  const esc=safeText;
  function hideMenu(){
    $s('studioProjectPanel').hidden=true;
    $s('studioProjectBtn').setAttribute('aria-expanded','false');
  }
  function closeDialogs(){
    for(const dialog of allDialogs)if(dialog.open)dialog.close();
  }
  function optionsForSectors(){
    return Object.entries(STANDS).map(([stand,data])=>{
      return '<optgroup label="Трибуна '+stand+' · '+esc(data.title)+'">'+
        data.sectors.map(id=>'<option value="'+esc(id)+'">'+esc(id)+'</option>').join('')+
        '</optgroup>';
    }).join('');
  }
  $s('studioSector').innerHTML=optionsForSectors();

  function syncSelection(){
    const sector=getSector(),row=getRow(),seat=getSeat();
    $s('studioSector').value=chosen;
    $s('studioSectorStats').textContent=sector.rows.length+' рядов · '+countSeats(sector)+' мест';
    const select=$s('studioRow');
    const options=sector.rows.length
      ?sector.rows.map(r=>'<option value="'+esc(r.id)+'">'+esc(r.label)+'</option>').join('')
      :'<option value="">—</option>';
    if(select.innerHTML!==options)select.innerHTML=options;
    select.value=row?row.id:'';
    select.disabled=!sector.rows.length;

    $s('studioTargetRow').setAttribute('aria-pressed',String(target==='row'));
    $s('studioTargetSeat').setAttribute('aria-pressed',String(target==='seat'));
    const canMove=target==='row'?!!row:!!seat&&!multiSelectEnabled;
    for(const b of host.querySelectorAll('[data-studio-move]'))b.disabled=!canMove;
    $s('studioAddSeat').disabled=!row;
    $s('studioOpenSeat').disabled=!seat;
    $s('studioSelected').textContent=target==='row'
      ?row?'Ряд '+row.label:'Выберите ряд'
      :seat?'Место '+seat.number:'Выберите место';

    $s('studioSettingsSector').textContent='Трибуна '+sector.stand+' · '+chosen;
    $s('studioRenumber').disabled=!row;
    $s('studioStraighten').disabled=!row;
    $s('studioOpenSettings').disabled=false;
    $s('studioRowsCount').textContent=sector.rows.length+' рядов';
    if(seatDialog.open)syncSeatDialog();
    if(rowDialog.open)renderRowsDialog();
    if(settingsDialog.open)renderInnerStairs();
  }
  function syncSeatDialog(){
    const row=getRow(),seat=getSeat();
    if(!row||!seat){
      if(seatDialog.open)seatDialog.close();
      return;
    }
    $s('studioSeatHeading').textContent='Место '+seat.number;
    $s('studioSeatSubheading').textContent='Ряд '+row.label;
    if(document.activeElement!==$s('studioSeatNumber'))$s('studioSeatNumber').value=seat.number;
    const pos=rowStairLayout(row,getSector()).ordered.indexOf(seat)+1;
    const button=$s('studioSeatInnerStair');
    button.disabled=pos<1||pos>=row.seats.length;
    button.textContent=(getSector().innerStairs||[]).includes(pos)?'− Убрать лестницу после места':'＋ Лестница после места';
  }
  function rowsFormDefaults(){
    $s('studioNewRowLabel').value=nextRowLabel();
    $s('studioNewRowCount').value=$s('newRowCount').value||20;
  }
  function renderRowsDialog(){
    const rows=getSector().rows;
    $s('studioRowsCount').textContent=rows.length+' рядов';
    const entries=rows.map((row,i)=>'<div class="studio-row-item'+(row.id===selectedRow?' is-active':'')+'">'+
      '<button type="button" class="studio-row-choice" data-studio-row-action="select" data-row-id="'+esc(row.id)+'">'+
      '<strong>'+esc(row.label)+'</strong><small>'+row.seats.length+' мест</small></button>'+
      '<div class="studio-row-buttons">'+
        '<button type="button" title="Изменить номер" aria-label="Изменить номер ряда '+esc(row.label)+'" data-studio-row-action="rename" data-row-id="'+esc(row.id)+'">✎</button>'+
        '<button type="button" title="Выше" aria-label="Переместить ряд выше" data-studio-row-action="up" data-row-id="'+esc(row.id)+'" '+(i===rows.length-1?'disabled':'')+'>↑</button>'+
        '<button type="button" title="Ниже" aria-label="Переместить ряд ниже" data-studio-row-action="down" data-row-id="'+esc(row.id)+'" '+(i===0?'disabled':'')+'>↓</button>'+
        '<button type="button" title="Дублировать" aria-label="Дублировать ряд" data-studio-row-action="copy" data-row-id="'+esc(row.id)+'">⧉</button>'+
        '<button type="button" title="Удалить" aria-label="Удалить ряд" class="danger" data-studio-row-action="delete" data-row-id="'+esc(row.id)+'">✕</button>'+
      '</div></div>').join('');
    const list=$s('studioRowsList');
    if(!rows.length)list.innerHTML='<div class="empty">Рядов пока нет</div>';
    else list.innerHTML=entries;
    // Do not reset a row label input while it is being edited.
  }

  function fitCanvas(resetScroll=false){
    if(mode!=='edit'||!autoFit)return;
    const svg=canvas.querySelector('svg[data-base-width]');
    if(!svg)return;
    const width=Number(svg.dataset.baseWidth),height=Number(svg.dataset.baseHeight);
    if(!(width>0&&height>0))return;
    const availableWidth=Math.max(70,frame.clientWidth-30);
    const availableHeight=Math.max(70,frame.clientHeight-30);
    const maxScale=window.innerWidth<=650?1.15:1.55;
    const scaled=Math.min(availableWidth/width,availableHeight/height,maxScale);
    zoom.edit=Math.max(.22,scaled);
    svg.setAttribute('width',String(Math.round(width*zoom.edit)));
    svg.setAttribute('height',String(Math.round(height*zoom.edit)));
    $s('editZoomLabel').textContent=Math.round(zoom.edit*100)+'%';
    if(resetScroll){
      frame.scrollTop=0;
      frame.scrollLeft=0;
    }
  }
  function scheduleFit(reset=false){
    if(!autoFit||mode!=='edit')return;
    if(raf)cancelAnimationFrame(raf);
    raf=requestAnimationFrame(()=>{
      raf=0;fitCanvas(reset||initialFit);initialFit=false;
    });
  }
  const previousRenderPreview=renderPreview;
  renderPreview=function(kind){
    const left=frame.scrollLeft,top=frame.scrollTop;
    previousRenderPreview(kind);
    if(kind==='edit'){
      if(autoFit)scheduleFit();
      else{frame.scrollLeft=left;frame.scrollTop=top;}
    }
  };
  const previousRenderEditor=renderEditor;
  renderEditor=function(){
    previousRenderEditor();
    syncSelection();
  };
  const previousRenderSeatEditor=renderSeatEditor;
  renderSeatEditor=function(){
    previousRenderSeatEditor();
    if(mode==='edit')syncSelection();
  };
  const previousRenderSelection=renderRowSelectionOnly;
  renderRowSelectionOnly=function(){
    previousRenderSelection();
    if(mode==='edit')syncSelection();
  };
  const previousSetMode=setMode;
  setMode=function(next){
    if(next==='edit'&&!getRow()&&getSector().rows.length)selectedRow=getSector().rows[0].id;
    const result=previousSetMode(next);
    document.body.classList.toggle('studio-active',next==='edit');
    if(next==='edit'){
      initialFit=true;
      syncSelection();
      scheduleFit(true);
    }else{
      hideMenu();
      closeDialogs();
    }
    return result;
  };
  // Initial state after the page has installed all editor modules.
  document.body.classList.toggle('studio-active',mode==='edit');
  if(mode==='edit')scheduleFit(true);
  syncSelection();

  $s('studioSector').addEventListener('change',e=>{
    hideMenu();closeDialogs();target='row';autoFit=true;initialFit=true;
    choose(e.target.value,'edit');
  });
  $s('studioRow').addEventListener('change',e=>{
    const row=getSector().rows.find(r=>r.id===e.target.value);
    if(!row)return;
    selectedRow=row.id;selectedSeat=null;multiSelectedSeatIds.clear();
    target='row';renderEditor();
  });
  $s('studioTargetRow').addEventListener('click',()=>{target='row';syncSelection();});
  $s('studioTargetSeat').addEventListener('click',()=>{target='seat';syncSelection();});

  // Seat hit testing still belongs to the original SVG drag handler.
  canvas.addEventListener('pointerdown',e=>{
    if(e.target.closest('[data-seat]')&&!multiSelectEnabled){
      target='seat';
      queueMicrotask(syncSelection);
    }
  },true);

  const steps={left:[-16,0],right:[16,0],up:[0,-16],down:[0,16]};
  function move(which){
    const delta=steps[which];
    if(!delta||mode!=='edit')return;
    if(target==='row'){
      if(!getRow())return;
      shiftSelectedRow(delta[0],delta[1]);
    }else{
      const seat=getSeat();if(!seat)return;
      seat.x+=delta[0];seat.y+=delta[1];changed();
    }
  }
  for(const button of host.querySelectorAll('[data-studio-move]'))
    button.addEventListener('click',()=>move(button.dataset.studioMove));
  document.addEventListener('keydown',e=>{
    if(mode!=='edit'||allDialogs.some(d=>d.open))return;
    if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName))return;
    const directions={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down'};
    if(directions[e.key]){
      e.preventDefault();move(directions[e.key]);
    }
  });
  for(const id of ['zoomEditIn','zoomEditOut'])
    $s(id).addEventListener('click',()=>{autoFit=false},true);
  $s('studioFit').addEventListener('click',()=>{
    autoFit=true;initialFit=true;scheduleFit(true);
  });
  window.addEventListener('resize',()=>{if(mode==='edit')scheduleFit()});

  $s('studioAddSeat').addEventListener('click',()=>{
    const row=getRow();if(!row)return;
    selectedSeat=appendSeatToRow(row).id;target='seat';changed();
  });
  function showRows(focusInput=false){
    rowsFormDefaults();renderRowsDialog();rowDialog.showModal();
    if(focusInput)$s('studioNewRowLabel').focus();
  }
  $s('studioAddRow').addEventListener('click',()=>showRows(true));
  $s('studioOpenRows').addEventListener('click',()=>showRows(false));
  $s('studioOpenSeat').addEventListener('click',()=>{
    if(!getSeat())return;
    syncSeatDialog();seatDialog.showModal();syncSeatDialog();
  });
  function syncStairButtons(){
    const side=getSector().stairSide||'none';
    $s('studioStairLeft').setAttribute('aria-pressed',String(side==='left'||side==='both'));
    $s('studioStairRight').setAttribute('aria-pressed',String(side==='right'||side==='both'));
  }
  function toggleStair(side){
    const current=getSector().stairSide||'none';
    const left=current==='left'||current==='both';
    const right=current==='right'||current==='both';
    const nextLeft=side==='left'?!left:left;
    const nextRight=side==='right'?!right:right;
    const value=nextLeft&&nextRight?'both':nextLeft?'left':nextRight?'right':'none';
    const select=$s('stairSide');
    select.value=value;
    select.dispatchEvent(new Event('change',{bubbles:true}));
    syncStairButtons();
  }
  $s('studioStairLeft').addEventListener('click',()=>toggleStair('left'));
  $s('studioStairRight').addEventListener('click',()=>toggleStair('right'));
  function renderInnerStairs(){
    const sector=getSector();
    const row=getRow()?.seats.length>=2?getRow():sector.rows.find(r=>r.seats.length>=2);
    const ordered=row?rowStairLayout(row,sector).ordered:[];
    const marks=Array.isArray(sector.innerStairs)?sector.innerStairs:[];
    const select=$s('studioInnerStairAfter');
    const previous=select.value;
    const choices=ordered.slice(0,-1).map((seat,i)=>
      '<option value="'+(i+1)+'">Между '+esc(seat.number)+' и '+esc(ordered[i+1].number)+'</option>'
    ).join('');
    if(select.innerHTML!==choices)select.innerHTML=choices;
    const picked=getSeat()&&getRow()===row?ordered.indexOf(getSeat())+1:0;
    const preferred=String(picked>0&&picked<ordered.length?picked:previous);
    if([...select.options].some(option=>option.value===preferred))select.value=preferred;
    select.disabled=choices.length===0;
    $s('studioInnerStairAdd').disabled=select.disabled||marks.length>=20;
    const list=$s('studioInnerStairsList');
    list.innerHTML=marks.length?marks.map(pos=>{
      const label=pos<ordered.length
        ?'Между '+esc(ordered[pos-1].number)+' и '+esc(ordered[pos].number)
        :'После '+pos+'-го места';
      return '<div class="studio-inner-stair-item"><span>'+label+'</span>'+
        '<button type="button" data-inner-stair-remove="'+pos+'" aria-label="Удалить внутреннюю лестницу">✕</button></div>';
    }).join(''):'';
  }
  function setInnerStair(pos,add){
    const sector=getSector();
    if(!Number.isInteger(pos)||pos<1||pos>499)return;
    const marks=new Set(Array.isArray(sector.innerStairs)?sector.innerStairs:[]);
    if(add){
      if(marks.has(pos))return;
      if(marks.size>=20){toast('Не более 20 лестниц в секторе');return;}
      marks.add(pos);
    }else{
      marks.delete(pos);
    }
    if(marks.size)sector.innerStairs=[...marks].sort((a,b)=>a-b);
    else delete sector.innerStairs;
    changed();
    if(settingsDialog.open)renderInnerStairs();
  }
  $s('studioInnerStairAdd').addEventListener('click',()=>{
    setInnerStair(Number($s('studioInnerStairAfter').value),true);
  });
  $s('studioInnerStairsList').addEventListener('click',event=>{
    const button=event.target.closest('[data-inner-stair-remove]');
    if(button)setInnerStair(Number(button.dataset.innerStairRemove),false);
  });
  $s('studioSeatInnerStair').addEventListener('click',()=>{
    const seat=getSeat(),row=getRow();
    if(!seat||!row)return;
    const pos=rowStairLayout(row,getSector()).ordered.indexOf(seat)+1;
    if(pos<1||pos>=row.seats.length)return;
    setInnerStair(pos,!(getSector().innerStairs||[]).includes(pos));
  });
  $s('studioOpenSettings').addEventListener('click',()=>{
    $s('stairSide').value=getSector().stairSide||'none';
    syncStairButtons();
    renderInnerStairs();
    settingsDialog.showModal();
  });
  for(const close of document.querySelectorAll('[data-studio-close]'))
    close.addEventListener('click',()=>($s(close.dataset.studioClose)).close());
  for(const dialog of allDialogs)
    dialog.addEventListener('click',e=>{
      if(e.target===dialog)dialog.close();
    });

  $s('studioRowForm').addEventListener('submit',e=>{
    e.preventDefault();
    $s('newRowLabel').value=$s('studioNewRowLabel').value.trim();
    $s('newRowCount').value=$s('studioNewRowCount').value;
    target='row';
    $s('addRow').click();
    rowsFormDefaults();
    renderRowsDialog();
  });
  function runOldRowAction(action,id){
    const names={up:'rowUp',down:'rowDown',copy:'rowCopy',delete:'rowDelete'};
    const key=names[action];
    if(!key)return;
    const button=[...$s('rowList').querySelectorAll('button[data-'+
      actionToData(action)+']')].find(el=>el.dataset[key]===id);
    if(button)button.click();
  }
  function actionToData(action){
    const name={up:'row-up',down:'row-down',copy:'row-copy',delete:'row-delete'};
    return name[action];
  }
  $s('studioRowsList').addEventListener('click',e=>{
    const button=e.target.closest('[data-studio-row-action]');
    if(!button)return;
    const action=button.dataset.studioRowAction;
    const row=getSector().rows.find(r=>r.id===button.dataset.rowId);
    if(!row)return;
    if(action==='select'){
      selectedRow=row.id;selectedSeat=null;multiSelectedSeatIds.clear();target='row';
      renderEditor();rowDialog.close();
    }else if(action==='rename'){
      const holder=button.closest('.studio-row-item').querySelector('.studio-row-choice');
      const input=document.createElement('input');
      input.className='field studio-inline-rename';
      input.value=row.label;
      input.maxLength=20;
      input.setAttribute('aria-label','Номер ряда');
      holder.replaceWith(input);
      const finish=save=>{
        if(!input.isConnected)return;
        if(save){
          const next=input.value.trim();
          if(!next||getSector().rows.some(r=>r!==row&&r.label===next)){
            toast('Такой номер ряда уже есть');
          }else if(next!==row.label){row.label=next;changed();}
        }
        renderRowsDialog();
      };
      input.addEventListener('keydown',event=>{
        if(event.key==='Enter'){event.preventDefault();finish(true);}
        if(event.key==='Escape'){event.stopPropagation();finish(false);}
      });
      input.addEventListener('blur',()=>finish(true),{once:true});
      input.focus();input.select();
    }else{
      if(action==='copy'||action==='delete')target='row';
      runOldRowAction(action,row.id);
      syncSelection();
    }
  });
  $s('studioSeatNumber').addEventListener('change',e=>{
    const row=getRow(),seat=getSeat(),next=e.target.value.trim();
    if(!row||!seat)return;
    if(!next||next.length>16||row.seats.some(other=>other.id!==seat.id&&other.number===next)){
      toast('Этот номер уже используется');e.target.value=seat.number;return;
    }
    seat.number=next;changed();
  });
  $s('studioSeatGapAdd').addEventListener('click',()=>adjustGap(24));
  $s('studioSeatGapRemove').addEventListener('click',()=>adjustGap(-24));
  function adjustGap(dx){
    const row=getRow(),seat=getSeat();if(!row||!seat)return;
    const ordered=[...row.seats].sort((a,b)=>a.x-b.x);
    const index=ordered.indexOf(seat);
    ordered.slice(index+1).forEach(s=>s.x+=dx);
    changed();
  }
  $s('studioSeatDelete').addEventListener('click',()=>{
    const row=getRow(),seat=getSeat();if(!row||!seat)return;
    if(!confirm('Удалить место '+seat.number+'?'))return;
    row.seats=row.seats.filter(s=>s.id!==seat.id);
    selectedSeat=null;target='row';seatDialog.close();changed();
  });
  $s('studioRenumber').addEventListener('click',()=>{
    const row=getRow();if(!row)return;
    renumberRow(row);changed();
  });
  $s('studioStraighten').addEventListener('click',()=>{
    const row=getRow();if(!row)return;
    if(!confirm('Выровнять ряд '+row.label+'?'))return;
    let x=0;
    [...row.seats].sort((a,b)=>a.x-b.x).forEach(seat=>{
      seat.x=x;seat.y=0;x+=seatWidth(seat)+6;
    });
    changed();
  });
  const projectPanel=$s('studioProjectPanel'),projectButton=$s('studioProjectBtn');
  projectButton.addEventListener('click',()=>{
    projectPanel.hidden=!projectPanel.hidden;
    projectButton.setAttribute('aria-expanded',String(!projectPanel.hidden));
  });
  projectPanel.addEventListener('click',e=>{
    const action=e.target.closest('[data-studio-project]')?.dataset.studioProject;
    if(!action)return;
    hideMenu();
    const originalId={png:'exportPngBtn',json:'exportBtn',import:'importBtn'}[action];
    if(originalId)$s(originalId).click();
  });
  document.addEventListener('pointerdown',e=>{
    if(!e.target.closest('.studio-project-menu'))hideMenu();
  });
})();
