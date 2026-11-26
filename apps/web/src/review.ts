import type {RapportReport} from './rapportBook';
import {fullDayMinutes} from './rapport';
export type Holiday={date:string;name:string};
export type HolidayCalendar={year:number;ticketId:number;revision:string;description:string;holidays:Holiday[];warnings:string[]};
export type Overtime={reportId:number;owner:{id:number;name:string};date:string;state:RapportReport['state'];work:number;target:number;extra:number;holiday?:string};
export type ReviewData={reports:RapportReport[];holidays:Holiday[];calendarWarnings:string[];overtime:Overtime[]};
export const reviewTarget=(date:string,holidays:Holiday[])=>holidays.some(h=>h.date===date)?0:fullDayMinutes(date);
