export const LIMITS = Object.freeze({edge:32760,pixels:48000000,tiles:160});
export function canvasSize(width,height,scale=1) {
  const w=Math.ceil(width*scale),h=Math.ceil(height*scale);
  if(!Number.isFinite(w*h)||w<1||h<1||w>LIMITS.edge||h>LIMITS.edge||w*h>LIMITS.pixels)throw Error('tooLarge');
  return {width:w,height:h};
}
export function axisPositions(total,viewport){
  if(!Number.isFinite(total+viewport)||total<1||viewport<1)throw Error('pageChanged');
  const values=[0];
  for(let p=viewport;p<total;p+=viewport)values.push(Math.min(p,total-viewport));
  return [...new Set(values)];
}
export function tiles(width,height,vw,vh){
  const result=[];
  for(const y of axisPositions(height,vh))for(const x of axisPositions(width,vw))result.push({x,y});
  if(result.length>LIMITS.tiles)throw Error('tooLarge');
  return result;
}
export function cropRect(rect,imageWidth,imageHeight){
  const values=['x','y','width','height','viewportWidth','viewportHeight'];
  if(values.some(k=>!Number.isFinite(rect[k]))||rect.width<3||rect.height<3||rect.viewportWidth<=0||rect.viewportHeight<=0)throw Error('invalidSelection');
  const sx=imageWidth/rect.viewportWidth,sy=imageHeight/rect.viewportHeight;
  const x=Math.max(0,Math.round(rect.x*sx)),y=Math.max(0,Math.round(rect.y*sy));
  const right=Math.min(imageWidth,Math.round((rect.x+rect.width)*sx));
  const bottom=Math.min(imageHeight,Math.round((rect.y+rect.height)*sy));
  if(right<=x||bottom<=y)throw Error('invalidSelection');
  return {x,y,width:right-x,height:bottom-y};
}
