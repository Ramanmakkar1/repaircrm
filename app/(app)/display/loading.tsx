/**
 * The board is drawn in the dark theme, so the app's light skeletons would
 * flash a white slab onto a shop-floor TV between refreshes. This paints the
 * board's own (dark theme) background instead and lets the tiles arrive into it.
 */
export default function DisplayLoading() {
  return (
    <div data-theme="dark" className="flex min-h-[calc(100dvh-5.5rem)] flex-col gap-4 rounded-2xl bg-background p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="h-12 w-64 rounded-md bg-surface" />
        <div className="h-12 w-72 rounded-md bg-surface" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="h-14 rounded-xl bg-surface" />
        ))}
      </div>
      <div className="grid flex-1 auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }, (_, index) => (
          <div key={index} className="min-h-[10rem] rounded-2xl bg-surface" />
        ))}
      </div>
    </div>
  );
}
