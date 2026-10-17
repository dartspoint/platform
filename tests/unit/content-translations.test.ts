import assert from 'node:assert/strict';
import test from 'node:test';
import {contentCopy,contentTranslationCurrent,validateContentTranslations} from '../../packages/contracts/src/content-translations';
import {localiseLobbyLayout} from '../../packages/i18n/src/lobby-content';
import {EMPTY_LOBBY_LAYOUT} from '../../packages/contracts/src/lobby';
test('CMS translation editions track source changes without depending on JSONB key order',()=>{
 const article={title:'Bron',summary:'Samenvatting',body:'Inhoud',ctaLabel:''};
 const item={...article,translations:{en:{source:{ctaLabel:'',body:'Inhoud',summary:'Samenvatting',title:'Bron'},text:{title:'Source',summary:'Summary',body:'Body',ctaLabel:''}}}};
 assert.equal(contentTranslationCurrent(item),true);assert.doesNotThrow(()=>validateContentTranslations(item));
 assert.equal(contentTranslationCurrent({...item,body:'Nieuwe bron'}),false);
 assert.equal(contentTranslationCurrent({...item,translations:{en:{...item.translations.en,text:{...item.translations.en.text,body:''}}}}),false);
 assert.throws(()=>validateContentTranslations({...item,translations:{en:{...item.translations.en,text:{unexpected:'value'}}}}));
});
test('Poll translations keep option positions and content identity intact',()=>{
 const widget={id:'poll',type:'poll',title:'Vraag',description:'Kies',settings:{pollOptions:['Ja','Nee']}};
 const item={...widget,translations:{en:{source:contentCopy(widget),text:{title:'Question',description:'Choose',ctaLabel:'',scoreLabel:'',pollOptions:['Yes','No']}}}};
 assert.equal(contentTranslationCurrent(item),true);
 assert.equal(contentTranslationCurrent({...item,translations:{en:{...item.translations.en,text:{...item.translations.en.text,pollOptions:['Yes','']}}}}),false);
 assert.equal(contentTranslationCurrent({...item,settings:{pollOptions:['Nee','Ja']}}),false);
 assert.equal(contentTranslationCurrent({...item,translations:{en:{...item.translations.en,text:{...item.translations.en.text,pollOptions:['Yes']}}}}),false);
 // The view localises a copy. Server IDs and the source used for vote versioning stay intact.
 const layout={...EMPTY_LOBBY_LAYOUT,widgets:[item]} as unknown as Parameters<typeof localiseLobbyLayout>[0];
 const english=localiseLobbyLayout(layout,'en');assert.equal(english.widgets[0].id,'poll');assert.deepEqual(english.widgets[0].settings.pollOptions,['Yes','No']);assert.deepEqual(layout.widgets[0].settings.pollOptions,['Ja','Nee']);
});
