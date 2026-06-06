import { useParams } from 'react-router-dom';
import { PageHeader } from '../ui/index.jsx';

export default function ClientDetailPage() {
  const { id } = useParams();
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <PageHeader title={`Cliente ${id || ''}`} />
      <div className="p-6">Detalle de cliente (placeholder)</div>
    </div>
  );
}
