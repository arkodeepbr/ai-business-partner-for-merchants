import {useEffect, useState} from 'react';
import {isDemoBuild, isSampleWorkspace} from '@/services/demo';

export function useSampleWorkspace() {
  const [sampleWorkspace, setSampleWorkspace] = useState(isDemoBuild);
  useEffect(() => {
    let active = true;
    isSampleWorkspace().then(value => { if (active) setSampleWorkspace(isDemoBuild || value); }).catch(() => {});
    return () => { active = false; };
  }, []);
  return sampleWorkspace;
}
