import { useState } from "react";
import { Link } from "react-router-dom";

const Navbar = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <nav className="bg-gray-800 text-white p-4 relative">
      {/* Logo / Titre */}

      {/* Bouton hamburger mobile */}
      <div>
        <button
          onClick={() => setDrawerOpen(true)}
          className="focus:outline-none"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>
      </div>

      {/* Drawer mobile */}
      <div
        className={`fixed top-0 left-0 h-full w-64 bg-gray-900 transform ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        } transition-transform duration-300 ease-in-out z-50`}
      >
        <div className="p-4">
          <button
            onClick={() => setDrawerOpen(false)}
            className="mb-4 focus:outline-none"
          >
            <svg
              className="w-6 h-6 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
          <nav className="flex flex-col space-y-2">
            <Link
              to="/"
              onClick={() => setDrawerOpen(false)}
              className="hover:text-gray-300"
            >
              Home
            </Link>
            <Link
              to="/chat"
              onClick={() => setDrawerOpen(false)}
              className="hover:text-gray-300"
            >
              Chat Interrupt
            </Link>
            <Link
              to="/test"
              onClick={() => setDrawerOpen(false)}
              className="hover:text-gray-300"
            >
              Chat Sans Interruption
            </Link>
            <Link
              to="/english"
              onClick={() => setDrawerOpen(false)}
              className="hover:text-gray-300"
            >
              English
            </Link>
            <Link
              to="/vacances"
              onClick={() => setDrawerOpen(false)}
              className="hover:text-gray-300"
            >
              Vacances avec le qr code
            </Link>
            <Link
              to="/chinois"
              onClick={() => setDrawerOpen(false)}
              className="hover:text-gray-300"
            >
              Traducteur de Vacances
            </Link>
            <Link
              to="/planches"
              onClick={() => setDrawerOpen(false)}
              className="hover:text-gray-300"
            >
              Planches
            </Link>

            <Link
              to="/final"
              onClick={() => setDrawerOpen(false)}
              className="hover:text-gray-300"
            >
              final
            </Link>
            <Link
              to="/final2"
              onClick={() => setDrawerOpen(false)}
              className="hover:text-gray-300"
            >
              final2
            </Link>
            <Link
              to="/final3"
              onClick={() => setDrawerOpen(false)}
              className="hover:text-gray-300"
            >
              version parfaite
            </Link>
            <Link
              to="/final4"
              onClick={() => setDrawerOpen(false)}
              className="hover:text-gray-300"
            >
              final4
            </Link>
            <Link
              to="/final5"
              onClick={() => setDrawerOpen(false)}
              className="hover:text-gray-300"
            >
              final5
            </Link>
            <Link
              to="/final6"
              onClick={() => setDrawerOpen(false)}
              className="hover:text-gray-300"
            >
              final6
            </Link>
            <Link
              to="/epitact"
              onClick={() => setDrawerOpen(false)}
              className="hover:text-gray-300"
            >
              Epitact
            </Link>
            <Link
              to="/chatsimple"
              onClick={() => setDrawerOpen(false)}
              className="hover:text-gray-300"
            >
              Chat Simple
            </Link>
            <Link
              to="/chatdieu"
              onClick={() => setDrawerOpen(false)}
              className="hover:text-gray-300"
            >
              Chat Dieu{" "}
            </Link>
          </nav>
        </div>
      </div>

      {/* Overlay pour fermer le drawer */}
      {drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 bg-black opacity-50 z-40"
        ></div>
      )}
    </nav>
  );
};

export default Navbar;
