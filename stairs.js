/* Visual stair aisles between neighbouring sectors.
   An aisle belongs to a sector edge, not between individual seats. */
(() => {
  'use strict';
  const allowed=new Set(['none','left','right','both']);
  const stairsFor=sector=>allowed.has(sector?.stairSide)?sector.stairSide:'none';
  const sides=value=>value==='both'?['left','right']:value==='none'?[]:[value];

  function stairMetrics(section,kind){
    const all=section.rows.flatMap(row=>row.seats);
    if(!all.length)return null;
    const minX=Math.min(0,...all.map(seat=>seat.x))-12;
    const maxX=Math.max(360,...all.map(seat=>seat.x+seatWidth(seat)));
    const shift=-minX+62;
    const rows=section.rows;
    const positions=rows.map((row,i)=>({row,base:49+(rows.length-1-i)*51}));
    const topMost=Math.min(...positions.flatMap(({row,base})=>[base+rowLabelOffset(row)-12,...row.seats.map(seat=>base+seat.y-16)]));
    const verticalShift=38-topMost;
    const ys=positions.flatMap(({row,base})=>row.seats.map(seat=>base+seat.y+verticalShift));
    const y1=Math.min(...ys)-16,y2=Math.max(...ys)+15;
    const leftSeat=Math.min(...all.map(seat=>seat.x));
    const rightSeat=Math.max(...all.map(seat=>seat.x+seatWidth(seat)));
    return {
      left:shift+leftSeat-27,
      right:shift+rightSeat+12,
      y:Math.max(20,y1),
      height:Math.max(30,y2-Math.max(20,y1)),
      width:14
    };
  }

  // Light, unobtrusive side marker with step treads. No oversized text.
  function stairSVG(x,y,w,h,side){
    let steps='';
    for(let k=10;k<h-4;k+=14)
      steps+='<line x1="'+(x+2)+'" y1="'+(y+k)+'" x2="'+(x+w-2)+
        '" y2="'+(y+k)+'" stroke="#8c9eae" stroke-width="1"/>';
    const name='Лестница '+(side==='left'?'слева':'справа')+' от сектора';
    return '<g class="sector-stair" role="img" aria-label="'+name+
      '" pointer-events="none"><title>'+name+'</title>'+
      '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+
      '" rx="2" fill="#f1f5f9" stroke="#b7c4d1" stroke-width="0.8"/>'+
      steps+'</g>';
  }

  const oldSeatSvg=seatSvg;
  seatSvg=function(kind){
    let svg=oldSeatSvg(kind);
    const section=getSector(),layout=stairsFor(section);
    if(layout==='none'||!svg.includes('</svg>'))return svg;
    const metrics=stairMetrics(section,kind);
    if(!metrics)return svg;
    const shapes=sides(layout).map(side=>stairSVG(
      metrics[side],metrics.y,metrics.width,metrics.height,side
    )).join('');
    return svg.replace('</svg>',shapes+'</svg>');
  };

  function canvasStairs(ctx,x,y,w,h){
    ctx.save();
    ctx.fillStyle='#f1f5f9';ctx.strokeStyle='#b7c4d1';ctx.lineWidth=0.8;
    ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h);
    ctx.strokeStyle='#8c9eae';ctx.lineWidth=1;
    for(let k=10;k<h-4;k+=14){
      ctx.beginPath();ctx.moveTo(x+2,y+k);ctx.lineTo(x+w-2,y+k);ctx.stroke();
    }
    ctx.restore();
  }

  const oldExport=drawExportCanvas;
  drawExportCanvas=function(id,section){
    const canvas=oldExport(id,section);
    if(!canvas||stairsFor(section)==='none')return canvas;
    const rows=section.rows,all=rows.flatMap(row=>row.seats);
    if(!all.length)return canvas;
    const minX=Math.min(0,...all.map(seat=>seat.x));
    const maxRight=Math.max(...all.map(seat=>seat.x+seatWidth(seat)));
    const minLeft=Math.min(...all.map(seat=>seat.x));
    const baseY=index=>108+(rows.length-1-index)*58;
    const lowY=Math.min(...rows.flatMap((row,i)=>row.seats.map(seat=>baseY(i)+seat.y-17)));
    const verticalShift=90-lowY;
    const ys=rows.flatMap((row,i)=>row.seats.map(seat=>baseY(i)+seat.y+verticalShift));
    const y=Math.min(...ys)-17,h=Math.max(32,Math.max(...ys)-Math.min(...ys)+35);
    const ctx=canvas.getContext('2d');
    if(!ctx)return canvas;
    for(const side of sides(stairsFor(section))){
      const x=side==='left'?100+minLeft-minX-29:100+maxRight-minX+15;
      canvasStairs(ctx,x,y,14,h);
    }
    return canvas;
  };

  const select=$('stairSide');
  if(select){
    const existingRender=renderEditor;
    renderEditor=function(){
      existingRender();
      select.value=stairsFor(getSector());
    };
    select.value=stairsFor(getSector());
    select.addEventListener('change',()=>{
      const value=select.value;
      if(!allowed.has(value))return;
      const sector=getSector();
      if(value==='none')delete sector.stairSide;
      else sector.stairSide=value;
      changed();
    });
  }
  const oldValidate=validateImport;
  validateImport=function(p){
    const result=oldValidate(p);
    for(const sector of Object.values(p.sectors))
      if(sector.stairSide!==undefined&&!allowed.has(sector.stairSide))
        throw Error('Недопустимая сторона лестницы в секторе '+sector.id);
    return result;
  };
})();
