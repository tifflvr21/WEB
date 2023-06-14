import { Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { GENERIC } from './lib/const';

import Navbar from './domain/Navbar';
import Sidebar from './domain/Sidebar';
import Chat from './domain/Chat';
import UserModal from './domain/UserModal';
import AlertManager from './domain/AlertManager';

import Auth from './scenes/Auth';
import Banned from './scenes/Banned';

import styles from './index.module.css';
import bg from './resources/images/bg.png';

const { user, events } = window.insolve;

function App(props) {
  const loc2 = useLocation().pathname.substring(1).toLowerCase();
  const location = props?.page || loc2;
  
  const [isLoading, setIsLoading] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(location);
  const [banned, setBanned] = useState(!!user.get('banned'));
  
  const updateBanned = isBanned => {
    setBanned(isBanned);
  }
  
  useEffect(() => setIsLoading(true), [location]);

  useEffect(() => {
    if(isLoading) {
      const timer = setTimeout(() => {
        setIsLoading(false);
        setCurrentLocation(location);
      }, GENERIC.PAGE_TRANSITION_TIME);

      return () => {
        clearTimeout(timer);
      };
    }
  }, [isLoading, location]);

  useEffect(() => {
    events.on('user:updateValue-banned', updateBanned);

    return () => {
      events.off('user:updateValue-banned', updateBanned);
    }
  }, []);

  return (
    <div className={styles.container} style={{backgroundImage: `url(${bg})`}} data-page={currentLocation}>
      <Sidebar />

      <div className={styles.main}>
        <Navbar />

        {/* <div className={styles.content} data-anim={isLoading || null} style={{transition: `all ${GENERIC.PAGE_TRANSITION_TIME}ms`}}> */}
        <div className={styles.content}>
          <Suspense fallback={<Auth />}>
            {banned ? <Banned /> : <Outlet />}
          </Suspense>
        </div>
          <Chat />
      </div>

      {/* floating things */}
      <UserModal />
      {/* <FreeCoinsModal /> */}
      {/* <PromoCodeModal /> */}
      <AlertManager />
    </div>
  );
}

export default App;
