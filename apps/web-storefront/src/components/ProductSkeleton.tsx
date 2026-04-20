interface ProductSkeletonProps {
  count?: number;
}

export function ProductSkeleton({ count = 4 }: ProductSkeletonProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex bg-white rounded-xl p-3 shadow-sm border border-gray-200 animate-pulse">
          <div className="flex-1 pr-3">
            <div className="h-4 bg-gray-200 rounded mb-2 w-3/4"></div>
            <div className="h-3 bg-gray-200 rounded mb-1 w-full"></div>
            <div className="h-3 bg-gray-200 rounded mb-3 w-2/3"></div>
            <div className="h-6 bg-gray-200 rounded w-1/2"></div>
          </div>
          <div className="w-24 h-24 bg-gray-200 rounded-lg"></div>
        </div>
      ))}
    </div>
  );
}

export function ComboSkeleton({ count = 2 }: ProductSkeletonProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex bg-orange-50/50 rounded-xl p-3 border border-orange-100/50 animate-pulse">
          <div className="flex-1 pr-3">
            <div className="h-4 bg-orange-200 rounded mb-2 w-3/4"></div>
            <div className="h-3 bg-orange-200 rounded mb-3 w-full"></div>
            <div className="h-6 bg-orange-200 rounded w-1/2"></div>
          </div>
          <div className="w-24 h-24 bg-orange-200 rounded-lg"></div>
        </div>
      ))}
    </div>
  );
}
