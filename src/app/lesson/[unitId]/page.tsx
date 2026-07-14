import { LessonClient } from './LessonClient';

export const dynamic = 'force-dynamic';

export default async function LessonPage({
  params,
}: {
  params: Promise<{ unitId: string }>;
}): Promise<React.JSX.Element> {
  const { unitId } = await params;
  return <LessonClient unitId={unitId} />;
}
