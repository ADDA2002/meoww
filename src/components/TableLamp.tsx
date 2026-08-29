const TableLamp = () => {
  return (
    <div className="relative flex flex-col items-center">
      {/* Hanging cord/string */}
      <div className="w-0.5 bg-gray-800 h-32"></div>
      
      {/* Lamp shade */}
      <div className="relative">
        {/* Shade top cap */}
        <div className="w-16 h-3 bg-gray-900 mx-auto rounded-t-sm"></div>
        
        {/* Main shade - trapezoid shape */}
        <div 
          className="bg-gradient-to-b from-gray-800 via-gray-700 to-gray-600"
          style={{
            clipPath: "polygon(15% 0%, 85% 0%, 100% 100%, 0% 100%)",
          }}
        >
          <div className="w-56 h-40 flex items-center justify-center">
            {/* Warm glow inside */}
            <div className="w-48 h-32 bg-gradient-to-b from-amber-100 via-amber-50 to-transparent rounded-b-full opacity-90"></div>
          </div>
        </div>
        
        {/* Light bulb glow effect */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-20 h-20 bg-amber-200 rounded-full blur-xl opacity-40"></div>
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-10 h-10 bg-amber-300 rounded-full blur-md opacity-60"></div>
      </div>

      {/* Lamp body/stand */}
      <div className="w-8 h-16 bg-gradient-to-b from-gray-700 to-gray-900 relative">
        {/* Pull string switch */}
        <div className="absolute -right-3 top-8 flex flex-col items-center">
          <div className="w-2 h-2 bg-amber-400 rounded-full shadow-lg shadow-amber-400/50"></div>
          <div className="w-0.5 h-16 bg-gray-600 mt-1"></div>
          <div className="w-4 h-3 bg-gray-800 rounded-sm mt-1 shadow-inner"></div>
        </div>
      </div>

      {/* Lamp base */}
      <div className="w-20 h-3 bg-gray-900 rounded-sm"></div>
      <div className="w-24 h-1.5 bg-gray-800 rounded-sm mt-0.5"></div>
    </div>
  );
};

export default TableLamp;