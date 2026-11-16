/* Independent, row-scoped stairways. Legacy full-height stairs remain unchanged.
   Stored as row.stairCuts (raw horizontal coordinates, one list per row). */
(() => {
  'use strict';
  const GAP=VERTICAL_STAIR_GAP;
  const MAX=20;
  const $id=id=>document.getElementById(id);
  const rowCuts=row=>Array.isArray(row?.stairCuts)
    ?row.stairCuts.filter(x=>Number.isFinite(x)&&Math.abs(x)<=50000).sort((a,b)=>a-b):[];
  const chosenRow=()=>getSector().rows.find(r=>r.id===rowChoice)||getRow()||getSector().rows[0]||null;
  let rowChoice=null,placing=false,drag=null;

  // The local aisle only displaces seats in its OWN row.
  const oldRowLayout=rowStairLayout;
  rowStairLayout=function(row,section){
    const layout=oldRowLayout(row,section),cuts=rowCuts(row);
    if(!cuts.length){layout.rowStairs=[];return layout;}
    for(const seat of layout.ordered){
      const x=layout.baseX.get(seat.id);
      const displacement=cuts.filter(cut=>x+seatWidth(seat)/2>=cut).length*GAP;
      layout.displayX.set(seat.id,layout.displayX.get(seat.id)+displacement);
    }
    const global=verticalStairCuts(section);
    layout.rowStairs=cuts.map((cut,i)=>({
      raw:cut,x:cut+global.filter(x=>x<=cut).length*GAP+i*GAP+VERTICAL_STAIR_INSET
    }));
    // Reposition preexisting per-position stairways alongside shifted seats.
    layout.stairs=layout.stairs.map(stair=>{
      const left=layout.ordered[stair.after-1],right=layout.ordered[stair.after];
      if(!left||!right)return stair;
      return {...stair,x:(layout.displayX.get(left.id)+seatWidth(left)+layout.displayX.get(right.id)-14)/2};
    });
    return layout;
  };

  function rowVerticalShift(section){
    const entries=section.rows.map((row,i)=>({row,base:49+(section.rows.length-1-i)*51}));
    const top=Math.min(...entries.flatMap(({row,base})=>[
      base+rowLabelOffset(row)-12,...row.seats.map(seat=>base+seat.y-16)
    ]));
    return 38-top;
  }
  const previousSeatSvg=seatSvg;
  seatSvg=function(kind){
    const section=getSector();
    let svg=previousSeatSvg(kind);
    if(!section.rows.length||!svg.includes('</svg>'))return svg;
    const layouts=section.rows.map(row=>rowStairLayout(row,section));
    if(!layouts.some(l=>l.rowStairs.length))return svg;
    const coords=section.rows.flatMap((row,i)=>row.seats.map(seat=>layouts[i].displayX.get(seat.id)));
    const shift=-Math.min(0,...coords)-(-12)+62; // same coordinate origin as seatSvg
    const dy=rowVerticalShift(section);
    let fragments='';
    section.rows.forEach((row,i)=>{
      const y=49+(section.rows.length-1-i)*51-25+rowLabelOffset(row)+dy;
      for(const stair of layouts[i].rowStairs){
        const x=shift+stair.x;
        fragments+='<g class="row-stairway" data-row-stair-id="'+safeText(row.id)+
          '" data-row-stair-x="'+stair.raw+'" role="button" tabindex="0" '+
          'aria-label="Лестница ряда '+safeText(row.label)+'" style="cursor:ew-resize" pointer-events="all">'+
          '<rect x="'+x+'" y="'+y+'" width="'+VERTICAL_STAIR_WIDTH+'" height="50" rx="2" fill="#dfeaf6" stroke="#7296b8" stroke-width="1"/>'+
          stairTreadsSVG(x,y,VERTICAL_STAIR_WIDTH,50)+'</g>';
      }
    });
    return svg.replace('</svg>',fragments+'</svg>');
  };

  const previousExport=drawExportCanvas;
  drawExportCanvas=function(id,section){
    const canvas=previousExport(id,section);
    if(!canvas||!section.rows.some(r=>rowCuts(r).length))return canvas;
    const layouts=section.rows.map(row=>rowStairLayout(row,section));
    const coords=section.rows.flatMap((row,i)=>row.seats.map(seat=>({
      x:layouts[i].displayX.get(seat.id),seat
    })));
    const minX=Math.min(0,...coords.map(c=>c.x));
    const maxX=Math.max(330,...coords.map(c=>c.x+seatWidth(c.seat)));
    const width=Math.ceil(Math.max(480,maxX-minX+204));
    const scale=canvas.width/width;
    const baseY=i=>108+(section.rows.length-1-i)*58;
    const lowY=Math.min(...section.rows.flatMap((row,i)=>row.seats.map(seat=>baseY(i)+seat.y-17)));
    const dy=90-lowY,ctx=canvas.getContext('2d');
    if(!ctx)return canvas;
    ctx.save();ctx.setTransform(scale,0,0,scale,0,0);
    section.rows.forEach((row,i)=>{
      const y=baseY(i)+dy-29+rowLabelOffset(row);
      for(const stair of layouts[i].rowStairs)
        canvasStairway(ctx,100+stair.x-minX,y,VERTICAL_STAIR_WIDTH,58);
    });
    ctx.restore();
    return canvas;
  };

  const oldImport=validateImport;
  validateImport=function(projectData){
    oldImport(projectData);
    for(const section of Object.values(projectData.sectors||{})){
      for(const row of section.rows||[]){
        if(row.stairCuts===undefined)continue;
        const cuts=row.stairCuts;
        if(!Array.isArray(cuts)||cuts.length>MAX||
           cuts.some(x=>!Number.isFinite(x)||Math.abs(x)>50000)||
           new Set(cuts).size!==cuts.length)
          throw Error('Неверные координаты лестниц ряда '+row.label);
      }
    }
    return true;
  };

  function positionsFor(row){
    const seats=oldRowLayout(row,getSector()).ordered;
    if(!seats.length)return [];
    const base=oldRowLayout(row,getSector()).baseX;
    const positions=[{label:'Слева от всех мест',x:Math.round(base.get(seats[0].id)-22)}];
    for(let i=0;i<seats.length-1;i++){
      const a=seats[i],b=seats[i+1];
      positions.push({
        label:'После места '+a.number+' (перед '+b.number+')',
        x:Math.round((base.get(a.id)+seatWidth(a)+base.get(b.id))/2)
      });
    }
    const last=seats[seats.length-1];
    positions.push({label:'Справа от всех мест',x:Math.round(base.get(last.id)+seatWidth(last)+12)});
    return positions;
  }
  function changeCut(row,value,oldValue=null){
    const x=Math.round(Number(value)),list=rowCuts(row).filter(cut=>cut!==oldValue);
    if(!Number.isFinite(x)||Math.abs(x)>50000)return false;
    if(list.length>=MAX){toast('Не более 20 лестниц на ряд');return false;}
    if(list.some(cut=>Math.abs(cut-x)<16)){toast('Слишком близко к другой лестнице');return false;}
    row.stairCuts=[...list,x].sort((a,b)=>a-b);
    changed();renderControls();
    return true;
  }
  function removeCut(row,x){
    const list=rowCuts(row).filter(cut=>cut!==x);
    if(list.length)row.stairCuts=list;
    else delete row.stairCuts;
    changed();renderControls();
  }

  const dialog=$id('studioSettingsDialog'),content=dialog?.querySelector('.studio-modal-content');
  const actions=content?.querySelector('.studio-modal-actions');
  if(content&&actions){
    const panel=document.createElement('div');
    panel.className='studio-inner-stairs';
    panel.id='rowStairPanel';
    panel.innerHTML=
      '<div class="studio-input-label">Лестницы отдельных рядов</div>'+
      '<p class="tip" style="margin:4px 0 10px">Каждый ряд настраивается независимо. Лестницу можно поставить слева, справа или между креслами.</p>'+
      '<label class="studio-input-label" for="rowStairRow">Ряд</label>'+
      '<select id="rowStairRow" class="field" aria-label="Ряд для лестницы"></select>'+
      '<div class="studio-inner-stairs-add" style="margin-top:10px">'+
      '<select id="rowStairPosition" class="field" aria-label="Позиция лестницы в ряду"></select>'+
      '<button type="button" class="btn primary" id="rowStairAdd">＋ Добавить</button></div>'+
      '<button type="button" class="btn" id="rowStairPlace" style="margin-top:8px">↔ Поставить на схеме</button>'+
      '<div id="rowStairList" class="studio-inner-stairs-list" style="margin-top:10px"></div>';
    content.insertBefore(panel,actions);
  }
  const svgHost=$id('editCanvas');
  const stage=svgHost?.parentElement;
  let hint=null;
  if(stage){
    hint=document.createElement('div');
    hint.id='rowStairHint';
    hint.className='studio-stair-place-hint';
    hint.hidden=true;
    hint.innerHTML='<span id="rowStairHintText">Выбери место в ряду</span>'+
      '<button type="button" id="rowStairCancel" aria-label="Отменить установку лестницы">✕</button>';
    stage.appendChild(hint);
    $id('rowStairCancel').addEventListener('click',cancelPlacing);
  }
  function cancelPlacing(){placing=false;if(hint)hint.hidden=true;}

  function renderControls(){
    const rowSelect=$id('rowStairRow');
    if(!rowSelect)return;
    const section=getSector();
    const rows=section.rows;
    if(!rows.some(row=>row.id===rowChoice))
      rowChoice=rows.some(row=>row.id===selectedRow)?selectedRow:(rows[0]?.id||null);
    rowSelect.innerHTML=rows.map(row=>
      '<option value="'+safeText(row.id)+'">Ряд '+safeText(row.label)+'</option>').join('');
    if(rowChoice)rowSelect.value=rowChoice;
    const row=chosenRow(),cutList=row?rowCuts(row):[];
    const position=$id('rowStairPosition');
    position.innerHTML=row?positionsFor(row).map(p=>
      '<option value="'+p.x+'">'+safeText(p.label)+'</option>').join(''):'';
    const disabled=!row||!row.seats.length;
    position.disabled=disabled;
    $id('rowStairAdd').disabled=disabled||cutList.length>=MAX;
    $id('rowStairPlace').disabled=disabled||cutList.length>=MAX;
    $id('rowStairList').innerHTML=(!row||!cutList.length)
      ?'<p class="tip">В выбранном ряду пока нет лестниц.</p>'
      :cutList.map((x,i)=>
       '<div class="studio-inner-stair-item"><span>Лестница '+(i+1)+'</span>'+
       '<div class="studio-stair-line-actions">'+
       '<button type="button" data-row-cut-index="'+i+'" data-row-cut-delta="-4" title="Сдвинуть влево">←</button>'+
       '<button type="button" data-row-cut-index="'+i+'" data-row-cut-delta="4" title="Сдвинуть вправо">→</button>'+
       '<button type="button" data-row-cut-index="'+i+'" data-row-cut-delete="1" title="Удалить">✕</button>'+
       '</div></div>').join('');
  }
  if($id('rowStairRow')){
    $id('rowStairRow').addEventListener('change',e=>{rowChoice=e.target.value;renderControls();});
    $id('rowStairAdd').addEventListener('click',()=>{
      const row=chosenRow();if(row)changeCut(row,Number($id('rowStairPosition').value));
    });
    $id('rowStairPlace').addEventListener('click',()=>{
      const row=chosenRow();if(!row||!row.seats.length)return;
      placing=true;
      dialog.close();
      $id('rowStairHintText').textContent='Нажми между креслами ряда '+row.label;
      hint.hidden=false;
    });
    $id('rowStairList').addEventListener('click',e=>{
      const btn=e.target.closest('[data-row-cut-index]');
      if(!btn)return;
      const row=chosenRow(),cuts=rowCuts(row),index=Number(btn.dataset.rowCutIndex);
      if(!row||!Number.isInteger(index)||index<0||index>=cuts.length)return;
      if(btn.dataset.rowCutDelete)removeCut(row,cuts[index]);
      else changeCut(row,cuts[index]+Number(btn.dataset.rowCutDelta),cuts[index]);
    });
    const prevRender=renderEditor;
    renderEditor=function(){prevRender();renderControls();};
    renderControls();
  }

  // A separate placement/drag path leaves the existing sector-wide stair tool intact.
  function pointOn(svg,event){
    if(!svg?.getScreenCTM())return null;
    const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;
    return p.matrixTransform(svg.getScreenCTM().inverse());
  }
  svgHost?.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    const svg=event.target.closest('svg');
    if(!svg)return;
    const p=pointOn(svg,event);if(!p)return;
    if(placing){
      event.preventDefault();event.stopImmediatePropagation();
      const row=chosenRow();if(!row){cancelPlacing();return;}
      const index=getSector().rows.indexOf(row);
      const expected=49+(getSector().rows.length-1-index)*51+rowLabelOffset(row)+rowVerticalShift(getSector());
      if(Math.abs(p.y-expected)>30){toast('Нажми возле кресел выбранного ряда');return;}
      const shift=Number(svg.dataset.coordShift||0);
      const options=positionsFor(row),global=verticalStairCuts(getSector()),local=rowCuts(row);
      const visibleX=x=>x+global.filter(v=>v<=x).length*GAP+
        local.filter(v=>v<x).length*GAP+VERTICAL_STAIR_INSET;
      const nearest=options.sort((a,b)=>
        Math.abs(visibleX(a.x)+shift-p.x)-Math.abs(visibleX(b.x)+shift-p.x))[0];
      if(nearest&&changeCut(row,nearest.x))cancelPlacing();
      return;
    }
    const marker=event.target.closest('.row-stairway');
    if(!marker)return;
    const row=getSector().rows.find(r=>r.id===marker.dataset.rowStairId);
    const raw=Number(marker.dataset.rowStairX);
    if(!row||!rowCuts(row).includes(raw))return;
    event.preventDefault();event.stopImmediatePropagation();
    rowChoice=row.id;selectedRow=row.id;renderControls();
    drag={pointer:event.pointerId,svg,marker,row,raw,x:p.x,dx:0};
  },true);
  document.addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.pointer)return;
    const p=pointOn(drag.svg,event);if(!p)return;
    drag.dx=Math.round((p.x-drag.x)/4)*4;
    drag.marker.setAttribute('transform','translate('+drag.dx+' 0)');
  },true);
  document.addEventListener('pointerup',event=>{
    if(!drag||event.pointerId!==drag.pointer)return;
    const d=drag;drag=null;
    if(d.dx){
      if(!changeCut(d.row,d.raw+d.dx,d.raw))
        d.marker.removeAttribute('transform');
    }else if(!dialog.open){renderControls();dialog.showModal();}
  },true);
  document.addEventListener('pointercancel',()=>{if(drag){drag.marker.removeAttribute('transform');drag=null;}},true);
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&placing)cancelPlacing();
  },true);
})();
