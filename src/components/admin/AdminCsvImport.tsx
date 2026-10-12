import React from 'react';
import { MemberDataImport, ImportMode, MASTER_FIELDS } from './MemberDataImport';

export const AdminCsvImport: React.FC<{ initialMode?: ImportMode }> = ({ initialMode = 'add_update' }) => {
  return <MemberDataImport initialMode={initialMode} />;
};

export { MemberDataImport, MASTER_FIELDS };
export type { ImportMode };
