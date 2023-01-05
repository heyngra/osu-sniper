document.getElementById("snipe").onchange = function () {
    fetch("/changesnipe", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            snipe: (document.getElementById("snipe").checked)
        })
    }).then(r => r.json()).then(r => {
        if (r.status === "Success!") {
            alert("Snipe changed successfully!"); //TODO: change to a modal like in tcain
        } else {
            alert("Error: " + r.error);
        }
    });
}

document.getElementById("logout").onclick = function () {
    fetch("/logout", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        }
    }).then(r => r.json()).then(r => {
        if (r.status === "Logged out!") {
            window.location.href = "/";
        } else {
            alert("Error: " + r.error); // TODO: change to a modal like in tcain
        }
    });
}
