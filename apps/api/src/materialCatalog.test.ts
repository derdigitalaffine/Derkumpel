import {describe,it,expect} from 'vitest';
import {parseMaterials,materialTemplate} from './materialCatalog.js';
describe('material rows',()=>{it('ignores template and comments, parses CRLF and decimal comma, reports bad rows',()=>{expect(parseMaterials(materialTemplate).items).toEqual([]);const r=parseMaterials(materialTemplate+'\r\nA | Salz | kg | Winter | 0,25\r\nMUSTER | Test | Stk\r\nA | Doppelt | kg\r\nkaputt');expect(r.items).toEqual([{code:'A',name:'Salz',unit:'kg',category:'Winter',price:0.25}]);expect(r.warnings).toHaveLength(2);});});
