export function DataUnavailable({ detail = "Polygon pool data is temporarily unavailable. Try again shortly." }: { detail?: string }) {
  return (
    <div className="empty-state" role="status">
      <strong>Data unavailable</strong>
      <p>{detail}</p>
    </div>
  );
}
