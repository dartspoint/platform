/** Server projections deliberately separate private cards, own ideas and public snapshots. */
export type ReleaseStatus='ideas'|'considering'|'doing'|'added';
export type ReleaseCategory='game'|'community'|'tournaments'|'account'|'other';
export type ReleasePriority='low'|'normal'|'high';
export const RELEASE_STATUSES:Record<ReleaseStatus,string>={ideas:'Ideeën',considering:'In overweging',doing:'In uitvoering',added:'Toegevoegd'};
export const RELEASE_CATEGORIES:Record<ReleaseCategory,string>={game:'Spel',community:'Community',tournaments:'Toernooien',account:'Account',other:'Overig'};
export const RELEASE_PRIORITIES:Record<ReleasePriority,string>={low:'Laag',normal:'Normaal',high:'Hoog'};
export type PublicReleaseUpdate={id:string;number:number;title:string;summary:string;category:ReleaseCategory;version:string;publishedAt:number};
export type ReleaseHistoryEntry={id:string;at:number;actor:string;text:string;revision?:number};
export type ReleaseItem={id:string;number:number;title:string;description:string;category:ReleaseCategory;status:ReleaseStatus;priority:ReleasePriority;authorName:string;source:'player'|'team';createdAt:number;updatedAt:number;version:string;releaseTitle:string;releaseSummary:string;notes:string;revision:number;history:ReleaseHistoryEntry[];publication?:PublicReleaseUpdate};
export type PlayerReleaseIdea=Pick<ReleaseItem,'id'|'number'|'title'|'description'|'category'|'status'|'createdAt'|'updatedAt'|'publication'>;
export type ReleaseItemPatch=Partial<Pick<ReleaseItem,'title'|'description'|'category'|'priority'|'status'|'version'|'releaseTitle'|'releaseSummary'|'notes'>>;
export type ReleaseBoardState={items:ReleaseItem[];revision:number;audit:{id:string;at:number;actor:string;action:string;subject:string;detail:string}[]};
