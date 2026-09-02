/**
 * The board is a dark surface, so the app's white skeletons would flash a
 * white slab onto a shop-floor TV between refreshes. This paints the board's
 * own background instead and lets the tiles arrive into it.
 */
export default function DisplayLoading() {
  return (
    <div className="flex min-h-[calc(100dvh-5.5rem)] flex-col gap-5 rounded-2xl bg-[#0a0a0b] p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div className="h-12 w-48 rounded-md bg-white/10" />
        <div className="flex flex-wrap items-center gap-2">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="h-9 w-28 rounded-full bg-white/10" />
          ))}
        </div>
        <div className="h-9 w-28 rounded-md bg-white/10" />
      </div>

      <div className="grid flex-1 auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }, (_, index) => (
          <div key={index} className="min-h-[9.5rem] rounded-2xl bg-white/[0.06]" />
        ))}
      </div>
    </div>
  );
}
