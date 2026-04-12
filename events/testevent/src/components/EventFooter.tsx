const EventFooter = () => {
  return (
    <footer className="border-t border-base-content/10 bg-base-200/40 backdrop-blur-sm text-sm text-base-content/70">
      <div className="container mx-auto px-4 py-6 flex items-center justify-center gap-2">
        <span className="text-base-content/50">Hosted on</span>
        <a
          href="https://arrowcloud.dance"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center hover:opacity-80 transition-opacity"
        >
          <img
            src="https://assets.arrowcloud.dance/logos/20250725/text-t.png"
            alt="Arrow Cloud"
            className="h-8 w-auto"
          />
        </a>
      </div>
    </footer>
  );
};

export default EventFooter;
