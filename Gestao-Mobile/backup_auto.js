
window.executarBackupDiario = function(){
  const hoje = new Date().toISOString().split("T")[0];
  if(localStorage.getItem("ultimo_backup_dia")===hoje) return;

  const backup = {
    data:new Date().toISOString(),
    trabalhos: JSON.parse(localStorage.getItem("ge_trabalhos")||"[]"),
    clientes: JSON.parse(localStorage.getItem("ge_clientes")||"[]"),
    pagamentos: JSON.parse(localStorage.getItem("ge_pagamentos")||"[]")
  };

  let lista = JSON.parse(localStorage.getItem("backups")||"[]");
  lista.push(backup);
  if(lista.length>30) lista.shift();

  localStorage.setItem("backups", JSON.stringify(lista));
  localStorage.setItem("ultimo_backup_dia", hoje);

  console.log("Backup OK");
};

window.addEventListener("load", ()=>setTimeout(window.executarBackupDiario,2000));
