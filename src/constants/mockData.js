export const billItems = [
  { id: 'bill-1', name: 'Smoky Angus Burger', price: '24.90', quantity: 1, orderedBy: 'You' },
  { id: 'bill-2', name: 'Truffle Cream Pasta', price: '28.90', quantity: 2, orderedBy: 'Aina' },
  { id: 'bill-3', name: 'Parmesan Truffle Fries', price: '11.90', quantity: 1, orderedBy: 'Daniel' },
]

export const orders = [
  { id: '#1048', table: 'T12', time: '2 min ago', status: 'New', items: ['2× Smoky Angus Burger', '1× Parmesan Truffle Fries'], total: 'RM 61.70' },
  { id: '#1047', table: 'T04', time: '6 min ago', status: 'Preparing', items: ['1× Truffle Cream Pasta', '2× Sparkling Lemonade'], total: 'RM 42.70' },
  { id: '#1046', table: 'T09', time: '12 min ago', status: 'Ready', items: ['2× Citrus Salmon Bowl'], total: 'RM 63.80' },
]

export const tableRows = [
  ['T01', '2 guests', 'Occupied', '12:12 PM'],
  ['T04', '4 guests', 'Occupied', '12:04 PM'],
  ['T09', '2 guests', 'Awaiting bill', '11:51 AM'],
  ['T12', '3 guests', 'Ordering', '11:46 AM'],
]
