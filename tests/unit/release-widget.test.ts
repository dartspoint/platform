import assert from 'node:assert/strict';
import test from 'node:test';
import {createLobbyWidget,validateLobbyLayout,visibleLobbyWidgets,type LobbyLayout} from '../../packages/contracts/src/lobby';

test('Release widget defaults integrate with the existing layout and room selection',()=>{
  const release=createLobbyWidget('releases');
  assert.deepEqual(release.settings,{releaseLimit:3,allowIdeas:true});
  const room='11111111-1111-4111-8111-111111111111';
  release.audience={mode:'rooms',roomIds:[room]};
  const other=createLobbyWidget('players');
  const layout:LobbyLayout={headline:'De club',eyebrow:'Welkom',widgets:[other,release],articles:[]};
  const before=structuredClone(layout);
  validateLobbyLayout(layout);
  assert.deepEqual(layout,before);
  assert.deepEqual(visibleLobbyWidgets(layout,room).map(widget=>widget.id),[other.id,release.id]);
  assert.deepEqual(visibleLobbyWidgets(layout,'22222222-2222-4222-8222-222222222222').map(widget=>widget.id),[other.id]);
});

test('Untrusted release widget settings cannot bypass count or idea-button validation',()=>{
  for(const value of [0,6,1.5,'3',null,Number.NaN]){
    const widget=createLobbyWidget('releases');widget.settings.releaseLimit=value as number;
    assert.throws(()=>validateLobbyLayout({headline:'De club',eyebrow:'',widgets:[widget],articles:[]}),/één tot vijf/);
  }
  for(const value of ['false',0,null]){
    const widget=createLobbyWidget('releases');widget.settings.allowIdeas=value as unknown as boolean;
    assert.throws(()=>validateLobbyLayout({headline:'De club',eyebrow:'',widgets:[widget],articles:[]}),/spelers via deze widget/);
  }
  for(const count of [1,5]){
    const widget=createLobbyWidget('releases');widget.settings={releaseLimit:count,allowIdeas:false};
    assert.doesNotThrow(()=>validateLobbyLayout({headline:'De club',eyebrow:'',widgets:[widget],articles:[]}));
  }
});
