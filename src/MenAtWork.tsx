import React from 'react';

function MenAtWork() {
  const style: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    flexGrow: 1,
    textAlign: 'center',
  };

  return (
    <div style={style}>
      <h1 style={{ fontSize: '600%' }}>&#x1F6A7;</h1>
      <h1>Men at Work</h1>
      <p>This page is under construction.</p>
    </div>
  );
}

export default MenAtWork;
