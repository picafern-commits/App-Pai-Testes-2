
window.PermissionsV1 = {
  list: JSON.parse(localStorage.getItem("perm_v1")||"[]"),
  save(data){
    this.list = this.list.filter(x=>x.id!==data.id);
    this.list.push(data);
    localStorage.setItem("perm_v1", JSON.stringify(this.list));
    alert("Permissão guardada");
  },
  get(email,device){
    return this.list.find(x=>x.email===email && x.device===device);
  }
};
