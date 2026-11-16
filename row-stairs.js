/* Independent, row-scoped stairways. Legacy full-height stairs remain unchanged.
   Stored as row.stairCuts (raw horizontal coordinates, one list per row). */
(() => {
  'use strict';
  const CLEARANCE=STAIR_SEAT_CLEARANCE;
  const TOTAL_AISLE=VERTICAL_STAIR_WIDTH+2*CLEARANCE;
  const MAX=20;
  const $id=id=>document.getElementById(id);
  const rowCuts=row=>Array.isArray(row?.stairCuts)
    ?row.stairCuts.filter(x=>Number.isFinite(x)&&Math.abs(x)<=50000).sort((a,b)=>a-b):[];
  const chosenRow=()=>getSector().rows.find(r=>r.id===rowChoice)||getRow()||getSector().rows[0]||null;
  let rowChoice=null,placing=false,drag=null;

  // Preserve source coordinates while giving local stairways the same
  // 12-unit edge clearance as the outer sector stairs. The historical cut
  // coordinate remains movable: the correction only changes its default.
  const oldRowLayout=rowStairLayout;
  rowStairLayout=function(row,section){
    const layout=oldRowLayout(row,section),cuts=rowCuts(row);
    if(!cuts.length){layout.rowStairs=[];return layout;}
    const ordered=layout.ordered,global=verticalStairCuts(section);
    const boundaries=cuts.map(cut=>{
      const onLeft=ordered.filter(seat=>layout.baseX.get(seat.id)+seatWidth(seat)/2<cut);
      const left=onLeft[onLeft.length-1]||null;
      const right=ordered.find(seat=>layout.baseX.get(seat.id)+seatWidth(seat)/2>=cut)||null;
      let addedGap=0,correction=0;
      if(left&&right){
        const leftEdge=layout.baseX.get(left.id)+seatWidth(left);
        const rightEdge=layout.baseX.get(right.id);
        const existingGap=rightEdge-leftEdge;
        addedGap=Math.max(0,TOTAL_AISLE-existingGap);
        const previousDefault=(leftEdge+rightEdge)/2;
        const normalizedDefault=leftEdge+CLEARANCE-VERTICAL_STAIR_INSET;
        correction=normalizedDefault-previousDefault;
      }else if(right){
        const firstEdge=layout.baseX.get(right.id);
        const previousDefault=firstEdge-22;
        const normalizedDefault=firstEdge-VERTICAL_STAIR_WIDTH-CLEARANCE-VERTICAL_STAIR_INSET;
        correction=normalizedDefault-previousDefault;
      }else if(left){
        const lastEdge=layout.baseX.get(left.id)+seatWidth(left);
        const previousDefault=lastEdge+12;
        const normalizedDefault=lastEdge+CLEARANCE-VERTICAL_STAIR_INSET;
        correction=normalizedDefault-previousDefault;
      }
      return {raw:cut,addedGap,correction};
    });
    for(const seat of ordered){
      const x=layout.baseX.get(seat.id);
      const shift=boundaries.reduce((acc,b)=>
        acc+(x+seatWidth(seat)/2>=b.raw?b.addedGap:0),0);
      layout.displayX.set(seat.id,layout.displayX.get(seat.id)+shift);
    }
    layout.rowStairs=boundaries.map((b,i)=>({
      raw:b.raw,
      x:b.raw+global.filter(x=>x<=b.raw).length*VERTICAL_STAIR_GAP+
        boundaries.slice(0,i).reduce((sum,entry)=>sum+entry.addedGap,0)+
        VERTICAL_STAIR_INSET+b.correction
    }));
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

  // Aisles with the same position in adjacent rows form ONE strip with
  // uninterrupted rails/treads. Changes of X are joined only if the full
  // connecting band is clear of all chairs. No per-row rectangle seams.
  function buildGroups(section,layouts,exportMode=false){
    const rows=section.rows,step=exportMode?58:51,origin=exportMode?108:49;
    const rowBase=i=>origin+(rows.length-1-i)*step;
    const center=i=>rowBase(i)+rowLabelOffset(rows[i]);
    const seatBoxes=rows.flatMap((row,i)=>row.seats.map(seat=>({
      x:layouts[i].displayX.get(seat.id),
      right:layouts[i].displayX.get(seat.id)+seatWidth(seat),
      top:rowBase(i)+seat.y-15,
      bottom:rowBase(i)+seat.y+13
    })));
    function collision(x,y,margin=1){
      return seatBoxes.some(seat=>
        y>seat.top-margin&&y<seat.bottom+margin&&
        x<seat.right+margin&&x+VERTICAL_STAIR_WIDTH>seat.x-margin);
    }
    function canJoin(a,b){
      if(b.y<=a.y||b.y-a.y>step*1.8||Math.abs(a.x-b.x)>8)return false;
      for(let y=a.y;y<=b.y;y+=3){
        const x=a.x+(b.x-a.x)*(y-a.y)/(b.y-a.y);
        if(collision(x,y))return false;
      }
      return !collision(b.x,b.y);
    }
    const groups=[];
    for(let i=rows.length-1;i>=0;i--){
      const active=new Set();
      for(const stair of layouts[i].rowStairs||[]){
        const node={rowIndex:i,raw:stair.raw,x:stair.x,y:center(i)};
        const group=groups.find(g=>{
          const previous=g.members[g.members.length-1];
          return !active.has(g)&&previous.rowIndex===i+1&&canJoin(previous,node);
        });
        if(group){group.members.push(node);active.add(group);}
        else groups.push({members:[node]});
      }
    }
    return groups.map(group=>{
      const first=group.members[0],last=group.members[group.members.length-1];
      let top=first.y-15,bottom=last.y+13;
      function xAt(y){
        if(y<=first.y)return first.x;
        if(y>=last.y)return last.x;
        for(let i=1;i<group.members.length;i++){
          const a=group.members[i-1],b=group.members[i];
          if(y<=b.y)return a.x+(b.x-a.x)*(y-a.y)/(b.y-a.y);
        }
        return last.x;
      }
      // The end of a staircase must stop before a chair in a neighbouring
      // row when the aisle changes position at the next row.
      for(const seat of seatBoxes){
        if(seat.right+2<=first.x||seat.x-2>=first.x+VERTICAL_STAIR_WIDTH){
          // Check both endpoints separately (some groups lean by up to 8px).
          if(seat.right+2<=last.x||seat.x-2>=last.x+VERTICAL_STAIR_WIDTH)
            continue;
        }
        if(seat.bottom<=first.y)top=Math.max(top,seat.bottom+3);
        if(seat.top>=last.y)bottom=Math.min(bottom,seat.top-3);
      }
      if(bottom-top<9)return null;
      return {...group,top,bottom,xAt};
    }).filter(Boolean);
  }

  function outlinePoints(group){
    const first=group.members[0],last=group.members[group.members.length-1];
    return [
      {y:group.top,x:first.x},
      ...group.members.map(m=>({y:m.y,x:m.x})),
      {y:group.bottom,x:last.x}
    ];
  }
  function stairPath(points,w){
    const left=points.map(p=>p.x+' '+p.y).join(' L ');
    const right=[...points].reverse().map(p=>(p.x+w)+' '+p.y).join(' L ');
    return 'M '+left+' L '+right+' Z';
  }
  function svgGroup(group,shift,dy){
    const w=VERTICAL_STAIR_WIDTH,pts=outlinePoints(group);
    const translated=pts.map(p=>({x:p.x+shift,y:p.y+dy}));
    let treads='';
    for(let y=group.top+10;y<group.bottom-4;y+=14){
      const x=shift+group.xAt(y);
      treads+='<line x1="'+(x+2)+'" y1="'+(y+dy)+
        '" x2="'+(x+w-2)+'" y2="'+(y+dy)+
        '" stroke="#8c9eae" stroke-width="1" pointer-events="none"/>';
    }
    return '<g class="row-stair-visual" pointer-events="none">'+
      '<path d="'+stairPath(translated,w)+'" fill="#f1f5f9" '+
      'stroke="#b7c4d1" stroke-width="0.8" stroke-linejoin="round"/>'+
      treads+'</g>';
  }
  function drawGroupsCanvas(ctx,section,layouts,minX,dy){
    ctx.save();
    ctx.fillStyle='#f1f5f9';ctx.strokeStyle='#b7c4d1';ctx.lineWidth=.8;
    for(const group of buildGroups(section,layouts,true)){
      const pts=outlinePoints(group),w=VERTICAL_STAIR_WIDTH;
      ctx.beginPath();
      pts.forEach((p,i)=>i?ctx.lineTo(100+p.x-minX,p.y+dy):ctx.moveTo(100+p.x-minX,p.y+dy));
      [...pts].reverse().forEach(p=>ctx.lineTo(100+p.x-minX+w,p.y+dy));
      ctx.closePath();ctx.fill();ctx.stroke();
      ctx.save();ctx.strokeStyle='#8c9eae';ctx.lineWidth=1;
      for(let y=group.top+10;y<group.bottom-4;y+=14){
        const x=100+group.xAt(y)-minX;
        ctx.beginPath();ctx.moveTo(x+2,y+dy);ctx.lineTo(x+w-2,y+dy);ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }
  window.ArenaRowStairs={groups:buildGroups,drawCanvas:drawGroupsCanvas};

  const previousSeatSvg=seatSvg;
  seatSvg=function(kind){
    const section=getSector();
    let svg=previousSeatSvg(kind);
    if(!section.rows.length||!svg.includes('</svg>'))return svg;
    const layouts=section.rows.map(row=>rowStairLayout(row,section));
    if(!layouts.some(l=>l.rowStairs.length))return svg;
    const coords=section.rows.flatMap((row,i)=>row.seats.map(seat=>layouts[i].displayX.get(seat.id)));
    const shift=74-Math.min(0,...coords);
    const dy=rowVerticalShift(section);
    const groups=buildGroups(section,layouts);
    const visuals=groups.map(g=>svgGroup(g,shift,dy)).join('');
    const targets=section.rows.map((row,i)=>{
      const center=49+(section.rows.length-1-i)*51+rowLabelOffset(row)+dy;
      return (layouts[i].rowStairs||[]).map(stair=>
        '<g class="row-stairway" data-row-stair-id="'+safeText(row.id)+
        '" data-row-stair-x="'+stair.raw+'" role="button" tabindex="0" '+
        'aria-label="Лестница ряда '+safeText(row.label)+'" style="cursor:ew-resize">'+
        '<rect x="'+(shift+stair.x)+'" y="'+(center-14)+'" width="'+VERTICAL_STAIR_WIDTH+
        '" height="28" fill="transparent" pointer-events="all"/></g>').join('');
    }).join('');
    // Paint the unified aisle once behind ALL seat groups, then add an
    // invisible drag target per row. This retains independent editing.
    return svg.replace('<text class="seat-row-label"',visuals+targets+'<text class="seat-row-label"');
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
      const options=positionsFor(row);
      const visibleX=x=>{
        const candidate={...row,stairCuts:[...rowCuts(row),x]};
        return rowStairLayout(candidate,getSector()).rowStairs.find(stair=>stair.raw===x)?.x??x;
      };
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
    const hit=marker.querySelector('rect');
    if(hit){hit.setAttribute('fill','#dfeaf6');hit.setAttribute('stroke','#7296b8');hit.setAttribute('stroke-width','1');}
    drag={pointer:event.pointerId,svg,marker,row,raw,x:p.x,dx:0};
  },true);
  document.addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.pointer)return;
    const p=pointOn(drag.svg,event);if(!p)return;
    drag.dx=Math.round((p.x-drag.x)/4)*4;
    drag.marker.setAttribute('transform','translate('+drag.dx+' 0)');
  },true);
  function resetDragMarker(marker){
    marker.removeAttribute('transform');
    const hit=marker.querySelector('rect');
    if(hit){hit.setAttribute('fill','transparent');hit.removeAttribute('stroke');hit.removeAttribute('stroke-width');}
  }
  document.addEventListener('pointerup',event=>{
    if(!drag||event.pointerId!==drag.pointer)return;
    const d=drag;drag=null;
    if(d.dx){
      if(!changeCut(d.row,d.raw+d.dx,d.raw))resetDragMarker(d.marker);
    }else{
      resetDragMarker(d.marker);
      if(!dialog.open){renderControls();dialog.showModal();}
    }
  },true);
  document.addEventListener('pointercancel',()=>{
    if(drag){resetDragMarker(drag.marker);drag=null;}
  },true);
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&placing)cancelPlacing();
  },true);
})();
