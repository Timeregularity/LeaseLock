export const events = [
  { id:'techfest-live', title:'TechFest Live', eyebrow:'Featured event', date:'25 Aug 2026', isoDate:'2026-08-25', time:'7:00 PM', venue:'Main Auditorium', available:62, total:100, price:500, status:'AVAILABLE', description:'An evening of ambitious ideas, practical engineering stories, and live product demonstrations.' },
  { id:'systems-summit', title:'Systems Summit', eyebrow:'Engineering forum', date:'02 Sep 2026', isoDate:'2026-09-02', time:'10:30 AM', venue:'Innovation Hall', available:14, total:80, price:750, status:'SELLING FAST', description:'Deep dives into distributed systems, reliability, and resilient products.' },
  { id:'design-code', title:'Design × Code', eyebrow:'Community session', date:'12 Sep 2026', isoDate:'2026-09-12', time:'4:00 PM', venue:'Studio Theatre', available:0, total:60, price:400, status:'SOLD OUT', description:'A focused conversation about bringing design craft and engineering discipline together.' }
]

const firstRow = ['available','available','held-other','available','reserved','available','available','available','reserved','available']
export const initialSeats = ['A','B','C','D'].flatMap((section, row) => Array.from({ length:10 }, (_, index) => ({
  id:`${section}${index + 1}`,
  section,
  price:row < 2 ? 500 : 350,
  status:row === 0 ? firstRow[index] : index === 2 && row === 1 ? 'held-other' : index === 7 && row === 2 ? 'reserved' : 'available'
})))

export const initialReservations = [
  { id:'LL-82A93K', event:events[0], seat:'A7', section:'A', price:500, status:'CONFIRMED', createdAt:'19 Aug 2026, 2:14 PM' },
  { id:'LL-51D72M', event:{ ...events[1], date:'18 Jun 2026' }, seat:'B4', section:'B', price:750, status:'CANCELLED', createdAt:'04 Jun 2026, 9:40 AM' }
]
