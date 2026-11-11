/* One-screen workspace for placing and moving rows and seats. No backend or schema changes. */
(() => {
  'use strict';

  const host=$('editView'),frame=host?.querySelector('.preview-frame'),canvas=$('editCanvas');
  const toggle=$('workModeToggle'),dock=$('workDock');
  if(!host||!frame||!canvas||!toggle||!dock)return;

  let open=false;
  let autoFit=true;
  let firstFit=true;
  let target='row'; // 'row' or 'seat'
  let oldOverflow='';
  let previousZoom=zoom.edit;
  let fitRequest=0;

  const $w=id=>document.getElementById(id);

  function syncDock(){
    if(!open)return;
    const sector=getSector(), row=getRow(),seat=getSeat();
    const select=$w('workRowSelect');
    const options=sector.rows.map(r=>'<option value="'+safeText(r.id)+'">'+safeText(r.label)+'</option>').join('');
    if(select.innerHTML!==options)select.innerHTML=options;
    if(row)select.value=row.id;
    select.disabled=!sector.rows.length;
    $w('workTargetRow').setAttribute('aria-pressed',String(target==='row'));
    $w('workTargetSeat').setAttribute('aria-pressed',String(target==='seat'));
    $w('workTargetRow').disabled=!row;
    $w('workTargetSeat').disabled=!row;
    const activeSeat=target==='seat'&&seat&&!multiSelectEnabled;
    for(const b of dock.querySelectorAll('[data-work-move]')){
      b.disabled=target==='row'?!row:!activeSeat;
    }
    const num=$w('workSeatNumber');
    if(document.activeElement!==num)num.value=activeSeat?seat.number:'';
    num.disabled=!activeSeat;
    $w('workAddSeat').disabled=!row;
    $w('workReverse').disabled=!row;
    $w('workFit').setAttribute('aria-pressed',String(autoFit));
    const status=$w('workStatus');
    status.textContent=multiSelectEnabled?
      'Выбирай соседние места на схеме и нажми «Объединить» сверху':
      target==='row'
        ?(row?'Двигается весь ряд '+row.label+' · шаг ½ места':'Добавь ряд, чтобы начать')
        :(seat?'Ряд '+row.label+' · место '+seat.number+' · шаг ½ места':
           'Нажми на кресло на схеме для перемещения');
  }

  function fitDiagram(center=false){
    if(!open||!autoFit)return;
    const svg=canvas.querySelector('svg[data-base-width]');
    if(!svg)return;
    const w=Number(svg.dataset.baseWidth),h=Number(svg.dataset.baseHeight);
    if(!(w>0&&h>0))return;
    const spaceH=Math.max(60,frame.clientHeight-22);
    const spaceW=Math.max(60,frame.clientWidth-22);
    // On a narrow phone keep the complete vertical layout visible, allowing
    // horizontal panning rather than shrinking seats to unreadable dots.
    const scale=window.innerWidth<=650?spaceH/h:Math.min(spaceH/h,spaceW/w);
    zoom.edit=Math.max(.12,Math.min(2.5,scale));
    svg.setAttribute('width',String(Math.round(w*zoom.edit)));
    svg.setAttribute('height',String(Math.round(h*zoom.edit)));
    $w('editZoomLabel').textContent=Math.round(zoom.edit*100)+'%';
    if(center) {
      frame.scrollTop=0;
      frame.scrollLeft=0;
    }
  }
  function scheduleFit(center=false){
    if(!open||!autoFit)return;
    if(fitRequest)cancelAnimationFrame(fitRequest);
    fitRequest=requestAnimationFrame(()=>{
      fitRequest=0;
      fitDiagram(center||firstFit);
      firstFit=false;
    });
  }

  // The existing renderer continues to own all seat hit areas and drag logic.
  const originalRenderPreview=renderPreview;
  renderPreview=function(kind){
    const left=frame.scrollLeft,top=frame.scrollTop;
    originalRenderPreview(kind);
    if(kind==='edit'&&open){
      syncDock();
      if(autoFit)scheduleFit();
      else {
        frame.scrollLeft=left;
        frame.scrollTop=top;
      }
    }
  };
  const originalRenderSeatEditor=renderSeatEditor;
  renderSeatEditor=function(){
    originalRenderSeatEditor();
    syncDock();
  };
  const originalRenderRowSelectionOnly=renderRowSelectionOnly;
  renderRowSelectionOnly=function(){
    originalRenderRowSelectionOnly();
    syncDock();
  };

  // Clicking an actual seat immediately changes the arrow keys to seat mode.
  canvas.addEventListener('pointerdown',e=>{
    if(!open)return;
    const seat=e.target.closest('[data-seat]');
    if(seat&&!multiSelectEnabled){
      target='seat';
      $w('workTargetSeat').setAttribute('aria-pressed','true');
      $w('workTargetRow').setAttribute('aria-pressed','false');
    }
  },true);

  function enter(){
    if(open)return;
    if(mode!=='edit')setMode('edit');
    open=true;autoFit=true;firstFit=true;target='row';
    previousZoom=zoom.edit;oldOverflow=document.body.style.overflow;
    if(!selectedRow&&getSector().rows.length)selectedRow=getSector().rows[0].id;
    document.body.style.overflow='hidden';
    host.classList.add('work-mode');
    toggle.textContent='✕ Обычный режим';
    toggle.setAttribute('aria-pressed','true');
    renderEditor();
    scheduleFit(true);
  }
  function exit(){
    if(!open)return;
    open=false;
    if(fitRequest)cancelAnimationFrame(fitRequest);
    fitRequest=0;
    host.classList.remove('work-mode');
    document.body.style.overflow=oldOverflow;
    toggle.textContent='⛶ Удобный режим';
    toggle.setAttribute('aria-pressed','false');
    zoom.edit=previousZoom;
    renderEditor();
  }
  toggle.addEventListener('click',()=>open?exit():enter());
  $w('workRowSelect').addEventListener('change',e=>{
    const row=getSector().rows.find(r=>r.id===e.target.value);
    if(!row)return;
    selectedRow=row.id;selectedSeat=null;
    multiSelectedSeatIds.clear();
    target='row';
    renderEditor();
  });
  $w('workTargetRow').addEventListener('click',()=>{
    target='row';
    syncDock();
  });
  $w('workTargetSeat').addEventListener('click',()=>{
    target='seat';
    syncDock();
    if(!getSeat())toast('Выбери кресло на схеме');
  });
  const coords={left:[-16,0],right:[16,0],up:[0,-16],down:[0,16]};
  function move(which){
    const delta=coords[which];
    if(!open||!delta)return;
    if(target==='row'){
      if(!getRow()){toast('Сначала выбери ряд');return}
      shiftSelectedRow(delta[0],delta[1]);
    }else{
      const seat=getSeat();
      if(!seat){toast('Нажми на кресло, которое нужно передвинуть');return}
      seat.x+=delta[0];seat.y+=delta[1];changed();
    }
    syncDock();
  }
  for(const button of dock.querySelectorAll('[data-work-move]')){
    button.addEventListener('click',()=>move(button.dataset.workMove));
  }
  $w('workSeatNumber').addEventListener('change',e=>{
    const seat=getSeat(),row=getRow(),v=e.target.value.trim();
    if(!seat||!row)return;
    if(!v||v.length>16||row.seats.some(other=>other.id!==seat.id&&other.number===v)){
      toast('Номер пустой, слишком длинный или уже занят в ряду');
      e.target.value=seat.number;return;
    }
    seat.number=v;changed();
  });
  $w('workAddSeat').addEventListener('click',()=>{
    const row=getRow();
    if(!row){toast('Выбери ряд');return}
    selectedSeat=appendSeatToRow(row).id;
    target='seat';
    changed();
  });
  $w('workAddRow').addEventListener('click',()=>{
    $('addRow').click();
    const row=getRow();
    if(row)target='row';
    syncDock();
  });
  $w('workReverse').addEventListener('click',()=>{
    const row=getRow();
    if(!row)return;
    renumberRow(row);
    changed();
  });
  $w('workFit').addEventListener('click',()=>{
    autoFit=true;
    firstFit=true;
    scheduleFit(true);
    syncDock();
  });
  for(const b of ['zoomEditIn','zoomEditOut']){
    $(b).addEventListener('click',()=>{if(open){autoFit=false;syncDock();}},true);
  }
  window.addEventListener('resize',()=>{if(open&&autoFit)scheduleFit();});
  document.addEventListener('keydown',e=>{
    if(!open)return;
    if(e.key==='Escape'){
      e.preventDefault();
      exit();
      return;
    }
    if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName))return;
    const dict={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down'};
    if(dict[e.key]){
      e.preventDefault();
      move(dict[e.key]);
    }
  });
  syncDock();
})();
