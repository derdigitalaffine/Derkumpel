import {describe,it,expect} from 'vitest';
import {equipmentTemplate,equipmentNames,equipmentAdditions} from './equipmentCatalog.js';
describe('equipment catalogue',()=>{it('ignores comments and deduplicates normalized names',()=>{expect(equipmentNames(equipmentTemplate)).toEqual([]);expect(equipmentNames('Mäher\r\n mäher \r\n# Muster\r\nTraktor')).toEqual(['Mäher','Traktor']);expect(equipmentAdditions(['Mäher'],[' MÄHER ','Kettensäge','kettensäge'])).toEqual(['Kettensäge']);});});
