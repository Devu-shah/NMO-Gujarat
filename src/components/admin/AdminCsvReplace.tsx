import React from 'react';
import { MemberDataImport } from './MemberDataImport';

export const AdminCsvReplace: React.FC = () => {
  return <MemberDataImport initialMode="replace_sync" />;
};
