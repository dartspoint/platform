import {test} from 'node:test';
import assert from 'node:assert/strict';
import {matchingFilterRules,normalizeFilterText,type FilterRule} from '../../packages/data/src/content-filter';
const rule=(term:string,scope:FilterRule['scope']='chat',matchType:FilterRule['matchType']='word',allow=false):FilterRule=>({id:term,term,scope,matchType,allow,active:true,description:'Test',category:'Test',aliases:[],version:1});
const rules=[rule('geil'),rule('kanker'),rule('sex'),rule('ga dood','chat','phrase'),rule('geile','name','name-prefix'),rule('sex','name','name-prefix'),rule('geil','name','word'),rule('kanker','name','word'),rule('Essex','both','word',true)];
test('Controlled normalization catches zero width, supported leet and dotted single letters',()=>{
 for(const input of ['GEIL','g3il','g\u200beil','k@nker','k.a.n.k.e.r','ＧＥＩＬ'])assert.ok(matchingFilterRules(input,'chat',rules).length,input);
 assert.equal(normalizeFilterText('dit is een gewone zin'),'dit is een gewone zin');
});
test('Whole words, phrases, explicit name prefixes and exceptions preserve valid words',()=>{
 for(const input of ['Essex','EssexPlayer','Sussex','homoseksueel','homo','religie','nationaliteit'])assert.equal(matchingFilterRules(input,'chat',rules).length,0,input);
 assert.equal(matchingFilterRules('Essex','name',rules).length,0);
 assert.equal(matchingFilterRules('GeileBoerin','name',rules).length,1);
 for(const name of ['Foo-geil','Foo_kanker'])assert.equal(matchingFilterRules(name,'name',rules).length,1);
 assert.equal(matchingFilterRules('ga dood','chat',rules).length,1);
 assert.equal(matchingFilterRules('Essex kanker','chat',rules).length,1,'An allowed word cannot suppress another forbidden word');
 assert.equal(matchingFilterRules('seksueel','chat',[rule('seks')]).length,0);
});
test('Inactive rules, safe literal aliases and exceptions are bounded and scoped',()=>{
 assert.equal(matchingFilterRules('geil','chat',[{...rule('geil'),active:false}]).length,0);
 assert.equal(matchingFilterRules('geile','chat',[{...rule('geil'),aliases:['geile']}]).length,1);
 assert.equal(matchingFilterRules('abcdef','chat',[rule('.*')]).length,0,'Admin terms cannot execute regex');
 assert.equal(matchingFilterRules('geile','chat',[rule('geile','name','name-prefix')]).length,0);
});
