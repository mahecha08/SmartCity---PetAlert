import { useState } from 'react';
import {
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from 'firebase/auth';
import { auth } from '../firebaseConfig';
import { LogIn, UserPlus } from 'lucide-react';

export function translateAuthError(code) {
  switch (code) {
    case 'auth/invalid-credential':
      return 'Credenciales inválidas. Verificá tu correo y contraseña.';
    case 'auth/email-already-in-use':
      return 'El correo electrónico ya está registrado.';
    case 'auth/weak-password':
      return 'La contraseña es muy débil (mínimo 6 caracteres).';
    case 'auth/invalid-email':
      return 'El formato del correo electrónico no es válido.';
    case 'auth/popup-closed-by-user':
      return 'Se cerró la ventana emergente antes de completar el inicio de sesión.';
    default:
      return 'Ocurrió un error al autenticar. Intentá de nuevo.';
  }
}

export function AuthCard({ title = "Iniciá sesión para reportar" }) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      setError(translateAuthError(err.code));
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isRegister) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setError(translateAuthError(err.code));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto bg-gray-900 border border-gray-700 rounded-2xl p-6 sm:p-8 shadow-2xl">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-white mb-2">{title}</h2>
        <p className="text-gray-400 text-sm">
          {isRegister
            ? 'Creá tu cuenta para gestionar y reportar mascotas.'
            : 'Ingresá a tu cuenta para reportar mascotas perdidas o avistamientos.'}
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-950/60 border border-red-500/60 rounded-lg text-red-300 text-sm">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={loading}
        className="w-full flex items-center justify-center py-3 px-4 bg-white hover:bg-gray-100 text-gray-900 font-semibold rounded-lg transition-colors shadow-md disabled:opacity-60 mb-5"
      >
        <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
          />
        </svg>
        Iniciar sesión con Google
      </button>

      <div className="relative flex py-2 items-center mb-5">
        <div className="flex-grow border-t border-gray-700"></div>
        <span className="flex-shrink mx-4 text-gray-500 text-xs uppercase tracking-wider">o con correo</span>
        <div className="flex-grow border-t border-gray-700"></div>
      </div>

      <form onSubmit={handleEmailSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-300 mb-1">Correo electrónico</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="correo@ejemplo.com"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-300 mb-1">Contraseña</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition-colors text-sm shadow-lg shadow-indigo-600/30 flex items-center justify-center disabled:opacity-50"
        >
          {loading ? (
            'Procesando...'
          ) : isRegister ? (
            <>
              <UserPlus className="w-4 h-4 mr-2" /> Registrarse
            </>
          ) : (
            <>
              <LogIn className="w-4 h-4 mr-2" /> Iniciar sesión
            </>
          )}
        </button>
      </form>

      <div className="mt-5 text-center">
        <button
          type="button"
          onClick={() => {
            setIsRegister(!isRegister);
            setError('');
          }}
          className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          {isRegister ? '¿Ya tenés cuenta? Iniciá sesión' : '¿No tenés cuenta? Registrate'}
        </button>
      </div>
    </div>
  );
}
