import { PERMISSIONS_KEY } from '../common/decorators';
import { RecipeBasesController } from './recipe-bases.controller';

describe('RecipeBasesController cost projection RBAC', () => {
  it('keeps current costs behind reports.view_costs instead of the general recipe read endpoints', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, RecipeBasesController.prototype.listCostProjections)).toEqual(['reports.view_costs']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, RecipeBasesController.prototype.costProjection)).toEqual(['reports.view_costs']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, RecipeBasesController.prototype.list)).toEqual(['inventory.read']);
  });
});
