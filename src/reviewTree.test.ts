import { expect, test } from "bun:test";
import { reviewTree } from "./reviewTree";
import type { Review, Change } from "./model";
function change(name: string, id: string, parent: string | null, kind: Change["kind"] = "function"): Change {
 return { id: `${kind}:${id}`, name, parent, kind, status: "modified", before: null,
 after: { id, name, parent, kind, start: 0, end: 1, line: 1, signature: "" } };
}
test("tree paths retain directory, class, nested/repeated-function identities and review targets", () => {
 const review: Review = {repo:"/repo",base:"base",head:"head",files:[{id:"0",path:"src/service.py",oldPath:"src/old.py",status:"R90",supported:true,changes:[
 change("Service","Service",null,"class"),change("fetch","Service.fetch","Service"),change("inner","Service.fetch.inner","Service.fetch"),change("fetch","Service.fetch#2","Service"),
 {id:"$module",name:"Module-level changes",parent:null,kind:"module",status:"modified",before:null,after:null},
 ]},{id:"1",path:"README.md",oldPath:"README.md",status:"A",supported:false,changes:[]}]};
 const tree=reviewTree(review);
 expect(tree.paths).toContain("src/service.py/C Service/ƒ fetch/ƒ inner");
 expect(tree.paths).toContain("src/service.py/C Service/ƒ fetch#2");
 expect(tree.rows.get("src/service.py/C Service/ƒ fetch/ƒ inner")?.change?.id).toBe("function:Service.fetch.inner");
 expect(tree.rows.get("src/service.py")?.change?.kind).toBe("module");
 expect(tree.rows.get("src/service.py")?.title).toContain("renamed from src/old.py");
 expect(tree.rows.get("src/service.py/· Module-level changes")?.change?.id).toBe("$module");
 expect(tree.rows.get("README.md")?.change).toBeNull();
 expect(tree.statuses).toContainEqual({path:"src/service.py",status:"renamed"});
 expect(new Set(tree.paths).size).toBe(tree.paths.length);
});
