import {useEffect,useState} from 'react';
import {useNetwork} from '@mantine/hooks';
import {api} from '../api';
export function useDispatcher(){
 const network=useNetwork(),[allowed,setAllowed]=useState(false);
 useEffect(()=>{let active=true;setAllowed(false);if(network.online)void api.rapportReviewAccess().then(r=>{if(active)setAllowed(r.allowed);}).catch(()=>undefined);return()=>{active=false;};},[network.online]);
 return allowed;
}
