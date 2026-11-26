import {afterEach,describe,it,expect,vi} from 'vitest';
import {fetchIssueBrowser,rememberInternalRapportProject} from './redmine.js';
import type {AppConfig} from './config.js';
const config={redmineBaseUrl:new URL('https://redmine.example.invalid'),redmineTimeoutMs:1000} as AppConfig;
const creds={version:1 as const,username:'test',password:'test',issuedAt:0};
afterEach(()=>vi.unstubAllGlobals());
describe('issue browser restricted project filters',()=>{
 it('does not request known internal projects',async()=>{rememberInternalRapportProject(123456);const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);expect(await fetchIssueBrowser(config,creds,{status:'*',projectId:123456,offset:0,limit:50})).toMatchObject({issues:[],filterUnavailable:true});expect(fetcher).not.toHaveBeenCalled();});
 it('signals inaccessible selected project but does not bypass permission',async()=>{const fetcher=vi.fn(async()=>Response.json({}, {status:403}));vi.stubGlobal('fetch',fetcher);expect(await fetchIssueBrowser(config,creds,{status:'*',projectId:34,offset:0,limit:50})).toMatchObject({issues:[],filterUnavailable:true});expect(fetcher).toHaveBeenCalledTimes(1);await expect(fetchIssueBrowser(config,creds,{status:'*',offset:0,limit:50})).rejects.toMatchObject({status:403});});
});
