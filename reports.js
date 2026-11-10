/* ArenaSector reporting: local data only, no server or external libraries. */
(() => {
  'use strict';
  const STAND_CODES = ['A','B','C','D'];
  const number = value => Number(value || 0).toLocaleString('ru-RU');
  const occupied = seat => Number.isInteger(seat.span) && seat.span > 0 ? seat.span : 1;
  const isBox = id => id === 'VIP' || (/^\d+$/.test(id) && Number(id) >= 401 && Number(id) <= 440);
  const rowSummary = row => ({
    label: row.label,
    seats: row.seats.length,
    positions: row.seats.reduce((sum, seat) => sum + occupied(seat),0),
    merged: row.seats.filter(seat => occupied(seat) > 1).length
  });
  function collectReport(code = 'all') {
    const entries = Object.entries(project.sectors)
      .filter(([,sector]) => code === 'all' || sector.stand === code)
      .sort((a,b) => a[1].stand.localeCompare(b[1].stand,'ru') ||
        (a[0]==='VIP' ? 1 : b[0]==='VIP' ? -1 : Number(a[0])-Number(b[0])));
    const sectors = entries.map(([id, sector]) => {
      const rows = sector.rows.map(rowSummary);
      return {
        id, stand: sector.stand, rows,
        rowCount: rows.length,
        seats: rows.reduce((sum,row)=>sum+row.seats,0),
        positions: rows.reduce((sum,row)=>sum+row.positions,0),
        merged: rows.reduce((sum,row)=>sum+row.merged,0),
        box: isBox(id)
      };
    });
    const total = array => ({
      sectorCount:array.length,
      completed:array.filter(x=>x.seats>0).length,
      rows:array.reduce((sum,x)=>sum+x.rowCount,0),
      seats:array.reduce((sum,x)=>sum+x.seats,0),
      positions:array.reduce((sum,x)=>sum+x.positions,0),
      merged:array.reduce((sum,x)=>sum+x.merged,0)
    });
    const stands = STAND_CODES.filter(stand=>code==='all'||stand===code)
      .map(stand=>({
        stand, name:STANDS[stand].title, color:STANDS[stand].color,
        ...total(sectors.filter(x=>x.stand===stand))
      }));
    return {filter:code, sectors, stands, ...total(sectors)};
  }
  function standHTML(code){
    const stand=STANDS[code];
    return '<span class="report-stand-name"><span class="report-stand-dot" style="background:'+
      stand.color+'"></span>'+code+' · '+safeText(stand.title)+'</span>';
  }
  function currentFilter() {
    return $('reportStandFilter')?.value || 'all';
  }
  function renderReports(){
    const container=$('reportStats');
    if(!container)return;
    const data=collectReport(currentFilter());
    const stats=[
      ['Секторов',data.sectors.length],
      ['С заполненными местами',data.completed],
      ['Рядов',data.rows],
      ['Посадочных мест',data.seats]
    ];
    container.innerHTML=stats.map(([label,value])=>
      '<div class="report-stat"><strong>'+number(value)+'</strong><span>'+label+'</span></div>').join('');
    $('reportDetails').textContent='Пустых секторов: '+number(data.sectors.length-data.completed)+'.';
    $('reportStandBody').innerHTML=data.stands.map(stand=>'<tr><td>'+standHTML(stand.stand)+
      '</td><td class="num">'+number(stand.sectorCount)+'</td><td class="num">'+number(stand.completed)+
      '</td><td class="num">'+number(stand.rows)+'</td><td class="num">'+number(stand.seats)+'</td></tr>').join('');
    $('reportSectorBody').innerHTML=data.sectors.map(sector=>
      '<tr><td>'+standHTML(sector.stand)+'</td><td><button type="button" class="sector-link" data-report-sector="'+
      safeText(sector.id)+'" title="Открыть редактор сектора">'+safeText(sector.id)+(sector.box?' · ложа':'')+
      '</button></td><td class="num">'+number(sector.rowCount)+'</td><td class="num">'+
      number(sector.seats)+'</td></tr>').join('');
    $('reportGeneratedAt').textContent='Данные из текущего проекта · обновлено '+
      new Date().toLocaleString('ru-RU')+'.';
  }
  window.renderReports=renderReports;

  // Simple page-based PDF encoder. Pages are rendered by Canvas to preserve
  // Cyrillic glyphs on all devices, including offline phones. JPEG is embedded
  // directly in a valid PDF 1.4; no CDN, font downloads or print dialog.
  class ImagePdf {
    constructor(){this.images=[];this.enc=new TextEncoder();}
    add(canvas){
      const image=canvas.toDataURL('image/jpeg',0.92);
      const binary=atob(image.slice(image.indexOf(',')+1));
      const bytes=new Uint8Array(binary.length);
      for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
      this.images.push({bytes,width:canvas.width,height:canvas.height});
    }
    toBlob(){
      const chunks=[];let offset=0;
      const offsets=[0];
      const addBytes=bytes=>{chunks.push(bytes);offset+=bytes.byteLength};
      const addText=text=>addBytes(this.enc.encode(text));
      const start=id=>{offsets[id]=offset;addText(id+' 0 obj\n')};
      const end=()=>addText('\nendobj\n');
      const count=this.images.length;
      addText('%PDF-1.4\n%ArenaSector\n');
      start(1);addText('<< /Type /Catalog /Pages 2 0 R >>');end();
      const pageIds=this.images.map((_,i)=>5+i*3);
      start(2);addText('<< /Type /Pages /Count '+count+' /Kids ['+pageIds.map(id=>id+' 0 R').join(' ')+'] >>');end();
      this.images.forEach((image,i)=>{
        const imgId=3+3*i,contentsId=imgId+1,pageId=imgId+2;
        start(imgId);
        addText('<< /Type /XObject /Subtype /Image /Width '+image.width+
          ' /Height '+image.height+
          ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+image.bytes.length+
          ' >>\nstream\n');
        addBytes(image.bytes);addText('\nendstream');end();
        const commands='q\n595.28 0 0 841.89 0 0 cm\n/Im0 Do\nQ\n';
        const contentBytes=this.enc.encode(commands);
        start(contentsId);
        addText('<< /Length '+contentBytes.length+' >>\nstream\n');
        addBytes(contentBytes);addText('endstream');end();
        start(pageId);
        addText('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89]'+
          ' /Resources << /XObject << /Im0 '+imgId+' 0 R >> >> /Contents '+
          contentsId+' 0 R >>');
        end();
      });
      const xref=offset;
      const size=3+3*count;
      addText('xref\n0 '+size+'\n0000000000 65535 f \n');
      for(let i=1;i<size;i++)addText(String(offsets[i]).padStart(10,'0')+' 00000 n \n');
      addText('trailer\n<< /Size '+size+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF');
      return new Blob(chunks,{type:'application/pdf'});
    }
  }
  class ReportPages {
    constructor(data,detailed){
      this.data=data;
      this.detailed=detailed;
      this.pdf=new ImagePdf();
      this.canvas=null;
      this.ctx=null;
      this.y=0;
      this.page=0;
      this.pageTitle=detailed?'Подробный отчёт':'Сводный отчёт';
      this.filterLabel=data.filter==='all'?'Все трибуны':
        'Трибуна '+data.filter+' · '+STANDS[data.filter].title;
      this.newPage();
    }
    newPage(){
      if(this.canvas)this.finishPage();
      this.page++;
      const canvas=document.createElement('canvas');
      canvas.width=1240;canvas.height=1754; // A4, 2px per layout unit
      const ctx=canvas.getContext('2d');
      if(!ctx)throw Error('Не удалось создать графику для PDF');
      ctx.scale(2,2);
      ctx.fillStyle='#ffffff';ctx.fillRect(0,0,620,877);
      ctx.fillStyle='#17253b';ctx.fillRect(0,0,620,10);
      ctx.fillStyle='#17253b';ctx.font='bold 19px Arial, sans-serif';
      ctx.fillText('ArenaSector · '+this.pageTitle,35,46);
      ctx.fillStyle='#67798b';ctx.font='12px Arial, sans-serif';
      ctx.fillText(this.filterLabel,35,66);
      ctx.textAlign='right';
      ctx.fillText(new Date().toLocaleDateString('ru-RU'),585,66);
      ctx.textAlign='left';
      ctx.strokeStyle='#dbe5ee';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(35,82);ctx.lineTo(585,82);ctx.stroke();
      this.canvas=canvas;this.ctx=ctx;this.y=105;
    }
    finishPage(){
      const ctx=this.ctx;
      ctx.strokeStyle='#dbe5ee';
      ctx.beginPath();ctx.moveTo(35,837);ctx.lineTo(585,837);ctx.stroke();
      ctx.fillStyle='#718197';ctx.font='11px Arial, sans-serif';
      ctx.fillText('Отчёт по данным текущего проекта ArenaSector',35,856);
      ctx.textAlign='right';ctx.fillText('Страница '+this.page,585,856);ctx.textAlign='left';
      this.pdf.add(this.canvas);
      this.canvas.width=0;this.canvas.height=0;
      this.canvas=null;this.ctx=null;
    }
    ensure(space){
      if(this.y+space>817)this.newPage();
    }
    gap(size=13){this.ensure(size);this.y+=size;}
    heading(text){
      this.ensure(34);
      this.ctx.fillStyle='#243950';this.ctx.font='bold 16px Arial, sans-serif';
      this.ctx.fillText(text,35,this.y+17,550);
      this.y+=32;
    }
    note(text){
      this.ensure(26);
      this.ctx.fillStyle='#61758d';this.ctx.font='12px Arial, sans-serif';
      this.ctx.fillText(text,35,this.y+13,550);
      this.y+=24;
    }
    metrics(values){
      this.ensure(82);
      const spacing=10,cols=values.length,w=(550-(cols-1)*spacing)/cols;
      const ctx=this.ctx;
      values.forEach(([label,value],i)=>{
        const x=35+i*(w+spacing);
        ctx.fillStyle='#f4f7fa';ctx.fillRect(x,this.y,w,72);
        ctx.fillStyle='#1d364f';ctx.font='bold 21px Arial, sans-serif';
        ctx.fillText(number(value),x+11,this.y+31,w-18);
        ctx.fillStyle='#60738a';ctx.font='11px Arial, sans-serif';
        ctx.fillText(label,x+11,this.y+54,w-18);
      });
      this.y+=84;
    }
    table(headers,values,widths){
      const columns=widths.map(x=>x*550);
      const header=()=>{
        this.ensure(48);
        const ctx=this.ctx;
        ctx.fillStyle='#edf2f7';ctx.fillRect(35,this.y,550,27);
        ctx.fillStyle='#445a72';ctx.font='bold 11px Arial, sans-serif';
        let x=35;
        headers.forEach((label,i)=>{
          const right=i>=2 || (headers.length===2 && i===1);
          ctx.textAlign=right?'right':'left';
          ctx.fillText(label,right?x+columns[i]-7:x+7,this.y+18,columns[i]-14);
          x+=columns[i];
        });
        ctx.textAlign='left';this.y+=27;
      };
      header();
      for(const row of values){
        if(this.y+25>817){this.newPage();header();}
        const ctx=this.ctx;
        const y=this.y;
        const index=(y/25)|0;
        if(index%2===0){ctx.fillStyle='#f9fbfd';ctx.fillRect(35,y,550,25);}
        ctx.fillStyle='#233a52';ctx.font='12px Arial, sans-serif';
        let x=35;
        row.forEach((cell,i)=>{
          const right=i>=2 || (headers.length===2 && i===1);
          ctx.textAlign=right?'right':'left';
          ctx.fillText(String(cell),right?x+columns[i]-7:x+7,y+17,columns[i]-14);
          x+=columns[i];
        });
        ctx.textAlign='left';
        ctx.strokeStyle='#e8edf3';ctx.beginPath();
        ctx.moveTo(35,y+25);ctx.lineTo(585,y+25);ctx.stroke();
        this.y+=25;
      }
      this.gap(9);
    }
    finish(){this.finishPage();return this.pdf.toBlob();}
  }
  function createPdf(data,detailed){
    const pdf=new ReportPages(data,detailed);
    pdf.heading('Общая информация');
    pdf.metrics([
      ['Секторов',data.sectors.length],
      ['С местами',data.completed],
      ['Рядов',data.rows],
      ['Мест',data.seats]
    ]);
    pdf.note('Секторов без мест: '+number(data.sectors.length-data.completed));
    pdf.heading('По трибунам');
    pdf.table(['Трибуна','Название','Секторов','С местами','Рядов','Мест'],
      data.stands.map(x=>[x.stand,x.name,number(x.sectorCount),number(x.completed),number(x.rows),number(x.seats)]),
      [0.10,0.20,0.17,0.18,0.16,0.19]);
    pdf.heading('По секторам');
    pdf.table(['Трибуна','Сектор','Рядов','Мест'],
      data.sectors.map(s=>[s.stand,s.id+(s.box?' (ложа)':''),number(s.rowCount),
        number(s.seats)]),
      [0.16,0.38,0.23,0.23]);
    if(detailed){
      pdf.heading('Ряды по секторам');
      const filled=data.sectors.filter(s=>s.rowCount>0);
      if(!filled.length)pdf.note('В выбранных секторах пока нет рядов.');
      for(const sector of filled){
        pdf.ensure(100);
        pdf.heading('Трибуна '+sector.stand+' · сектор '+sector.id);
        pdf.note('Рядов: '+number(sector.rowCount)+
          ' · Мест: '+number(sector.seats));
        pdf.table(['Ряд','Мест'],
          sector.rows.map(row=>[String(row.label),number(row.seats)]),
          [0.50,0.50]);
      }
    }
    return pdf.finish();
  }
  async function downloadReport(detailed){
    const filter=currentFilter();
    const button=$(detailed?'reportDetailedPdf':'reportSummaryPdf');
    const original=button.textContent;
    button.disabled=true;button.textContent='Формирование PDF…';
    const status=$('reportState');
    status.textContent='Создание отчёта на устройстве…';
    try{
      await new Promise(resolve=>setTimeout(resolve,0)); // Paint button state.
      const data=collectReport(filter);
      const blob=createPdf(data,detailed);
      const date=new Date();
      const datePart=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
      const fileName='ArenaSector-'+(detailed?'detailed':'summary')+'-'+filter+'-'+datePart+'.pdf';
      downloadBlob(blob,fileName);
      status.textContent='PDF сформирован: '+fileName+' · '+number(data.sectors.length)+' секторов.';
    }catch(error){
      status.textContent='Ошибка PDF: '+(error?.message||String(error));
      toast('Не удалось сформировать отчёт: '+(error?.message||String(error)));
    }finally{
      button.disabled=false;button.textContent=original;
    }
  }
  $('reportStandFilter').addEventListener('change',renderReports);
  $('reportSummaryPdf').addEventListener('click',()=>downloadReport(false));
  $('reportDetailedPdf').addEventListener('click',()=>downloadReport(true));
  $('reportSectorBody').addEventListener('click',event=>{
    const button=event.target.closest('[data-report-sector]');
    if(button)choose(button.dataset.reportSector);
  });
  // Current project changes are reflected whenever the Reports tab opens.
  renderReports();
  // Limited QA hooks without changing any project storage.
  window.ArenaReport={collectReport,createPdf};
})();
